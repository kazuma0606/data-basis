# テクノマート データ基盤 v1.2 仕様書

作成日: 2026-03-19
バージョン: v1.2（ブランチ: v1.2_development）

---

## 目次

1. [システム概要](#1-システム概要)
2. [インフラ構成](#2-インフラ構成)
3. [Kubernetes Pod・サービス一覧](#3-kubernetes-podサービス一覧)
4. [認証・認可設計](#4-認証認可設計)
5. [アプリケーション API](#5-アプリケーション-api)
6. [データパイプライン](#6-データパイプライン)
7. [デプロイ手順](#7-デプロイ手順)
8. [初期データ投入（seed_all.sh）](#8-初期データ投入seed_allsh)
9. [運用・障害対応](#9-運用障害対応)

---

## 1. システム概要

中規模リテール企業（架空：株式会社テクノマート）向けのデータ基盤。
VirtualBox VM 上の k3s（軽量 Kubernetes）にすべてのサービスをデプロイし、本番 AWS（EKS）への移行パスを常に維持する。

### 設計原則

| 原則 | 内容 |
|---|---|
| ローカル完結 | 外部 API・SaaS を一切使わない。LLM は Ollama（完全ローカル） |
| 本番同型 | LocalStack→S3、k3s→EKS の差分が最小になる構成 |
| データリアリティ | Synthetic Data に意図的な「汚れ」を入れ、名寄せ・クレンジングを再現 |

### ホストマシン

| 項目 | 値 |
|---|---|
| CPU | Intel Core Ultra 7 265KF |
| RAM | 128 GB |
| OS | Windows 11 Pro |
| 仮想化 | VirtualBox |

### VM スペック（production）

| 項目 | 値 |
|---|---|
| Box | bento/ubuntu-24.04 |
| Hostname | technomart |
| IP | 192.168.56.10（Host-Only） |
| CPU | 10 コア |
| RAM | 48 GB (49152 MB) |
| ストレージ | 200 GB |
| Vagrant 共有 | ホスト側 `data-basis/` → VM 内 `/technomart/` |

---

## 2. インフラ構成

```
ホストマシン (Windows 11)
  └─ VirtualBox VM (Ubuntu 24.04 / 192.168.56.10)
        └─ k3s (Kubernetes 軽量ディストリビューション)
              ├─ Namespace: technomart
              │     ├─ Kafka (KRaft)          :32092
              │     ├─ Redis                  :32379
              │     ├─ PostgreSQL + pgvector  :32432
              │     ├─ ClickHouse             :30823 (HTTP) / :30900 (native)
              │     ├─ LocalStack (S3)        :31566
              │     ├─ Ollama                 :31434
              │     ├─ Registry               :32500
              │     ├─ Backend (ClusterIP)    ← Ingress 経由のみ
              │     ├─ Frontend (ClusterIP)   ← Ingress 経由のみ
              │     └─ Ingress Nginx          :31408 (HTTP) / :32239 (HTTPS)
              └─ ingress-nginx (Namespace: ingress-nginx)
```

### ネットワークアクセス

| エンドポイント | 用途 | 外部公開 |
|---|---|---|
| `https://192.168.56.10:32239/` | フロントエンド（Ingress HTTPS） | ✓ |
| `http://192.168.56.10:31408/` | HTTP → HTTPS リダイレクト | ✓（307） |
| `192.168.56.10:32092` | Kafka Bootstrap | ✓（開発用） |
| `192.168.56.10:32432` | PostgreSQL | ✓（開発用） |
| `192.168.56.10:30823` | ClickHouse HTTP | ✓（開発用） |
| `192.168.56.10:31566` | LocalStack S3 | ✓（開発用） |
| `192.168.56.10:31434` | Ollama | ✓（開発用） |
| `backend:8000` | バックエンド API | ✗（ClusterIP のみ） |

---

## 3. Kubernetes Pod・サービス一覧

### Namespace

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: technomart
```

---

### 3-1. Kafka（KRaft モード）

| 項目 | 値 |
|---|---|
| Kind | StatefulSet |
| Image | apache/kafka:3.9.0 |
| Replicas | 1 |
| Service Type | NodePort |
| Port | 9092 → NodePort 32092 |
| PVC | kafka-pvc 10Gi |
| CPU Request/Limit | 500m / 2000m |
| RAM Request/Limit | 1Gi / 4Gi |

**トピック構成**

| トピック | パーティション | レプリカ | 保持期間 |
|---|---|---|---|
| ec.events | 3 | 1 | 168h（7日） |
| pos.transactions | 3 | 1 | 168h（7日） |
| app.behaviors | 3 | 1 | 168h（7日） |
| inventory.updates | 1 | 1 | 168h（7日） |
| customer.scores | 1 | 1 | 24h |

**コンシューマーグループ**

| GROUP_ID | 役割 |
|---|---|
| pg-writer | Kafka → PostgreSQL（staging テーブル） |
| s3-writer | Kafka → S3（LocalStack）生データ保存 |
| inventory-sync | Kafka → PostgreSQL（inventory）同期 |

---

### 3-2. Redis

| 項目 | 値 |
|---|---|
| Kind | Deployment |
| Image | redis:7-alpine |
| Replicas | 1 |
| Service Type | NodePort |
| Port | 6379 → NodePort 32379 |
| PVC | redis-pvc 2Gi |
| CPU Request/Limit | 100m / 500m |
| RAM Request/Limit | 256Mi / 512Mi |

**用途**: スコアのリアルタイムキャッシュ（TTL 24h）

---

### 3-3. PostgreSQL + pgvector

| 項目 | 値 |
|---|---|
| Kind | Deployment |
| Image | pgvector/pgvector:pg16 |
| Replicas | 1 |
| Service Type | NodePort |
| Port | 5432 → NodePort 32432 |
| PVC | postgresql-pvc 20Gi |
| CPU Request/Limit | 500m / 1000m |
| RAM Request/Limit | 1Gi / 2Gi |

**主要テーブル**

| テーブル | 説明 |
|---|---|
| `app_users` | アプリ認証ユーザー（username, hashed_password, role, store_id） |
| `unified_customers` | 名寄せ済み統合顧客マスタ |
| `customer_source_map` | EC / POS / App の ID マッピング |
| `customer_scores` | スコア（カテゴリ親和性・チャーンリスク等） |
| `unified_products` | 商品マスタ（embedding vector(768) カラム含む） |
| `staging_ec_events` | Kafka 経由の EC イベント staging |
| `staging_pos_transactions` | Kafka 経由の POS トランザクション staging |

**pgvector**: extension バージョン 0.8.2、`vector(768)` カラム（nomic-embed-text 次元数）

**接続情報（k8s 内）**

```
host: postgresql.technomart.svc.cluster.local
port: 5432
database: technomart
user: technomart
password: backend-secret の POSTGRES_PASSWORD
```

---

### 3-4. ClickHouse

| 項目 | 値 |
|---|---|
| Kind | Deployment |
| Image | clickhouse/clickhouse-server:24.8 |
| Replicas | 1 |
| Service Type | NodePort |
| Port (HTTP) | 8123 → NodePort 30823 |
| Port (native) | 9000 → NodePort 30900 |
| PVC | clickhouse-pvc 30Gi |
| CPU Request/Limit | 500m / 2000m |
| RAM Request/Limit | 1Gi / 4Gi |

**テーブル**

| テーブル | 説明 |
|---|---|
| `ec_events` | EC イベントログ（S3 ETL 日次ロード） |
| `pos_transactions` | POS 購買データ（S3 ETL 日次ロード） |
| `sales_by_channel` | チャネル別売上集計 |
| `customer_scores_daily` | 日次スコア集計 |
| `category_affinity_summary` | カテゴリ × 年齢層 別親和性集計 |
| `churn_summary_weekly` | 週次チャーンリスク分布（high/medium/low） |

**接続情報（k8s 内）**

```
host: clickhouse.technomart.svc.cluster.local
port: 8123 (HTTP / clickhouse_connect 使用)
database: technomart
user: technomart
```

---

### 3-5. LocalStack（S3 エミュレーション）

| 項目 | 値 |
|---|---|
| Kind | Deployment |
| Image | localstack/localstack:3.8 |
| Replicas | 1 |
| Service Type | NodePort |
| Port | 4566 → NodePort 31566 |
| Storage | emptyDir（永続化なし） |
| CPU Request/Limit | 100m / 500m |
| RAM Request/Limit | 256Mi / 1Gi |

**S3 バケット**（Terraform `infrastructure/terraform/localstack/` で管理）

| バケット名 | 用途 |
|---|---|
| `technomart-datalake` | メインデータレイク（ログ・ETL 出力・モデル成果物） |
| `technomart-raw` | Kafka 生データ（不変保持）、バージョニング有効 |
| `technomart-aggregated` | 集計済みデータ（ClickHouse ETL ソース） |
| `technomart-models` | ML モデル・Embedding 成果物 |

**本番との対応**: provider `endpoints` ブロックを削除するだけで AWS S3 に移行可能

---

### 3-6. Ollama（LLM ローカル推論）

| 項目 | 値 |
|---|---|
| Kind | Deployment |
| Image | ollama/ollama:latest |
| Replicas | 1 |
| Service Type | NodePort |
| Port | 11434 → NodePort 31434 |
| PVC | ollama-pvc 20Gi |
| CPU Request/Limit | 2000m / 4000m |
| RAM Request/Limit | 4Gi / 8Gi |
| progressDeadlineSeconds | 1200（大きいイメージのため） |

**デプロイ済みモデル**

| モデル | 用途 |
|---|---|
| `nomic-embed-text` | 商品・顧客 Embedding 生成（768 次元） |
| `qwen2.5:3b` | 通知文生成・自然言語クエリ応答（日本語対応） |

**本番（Bedrock）との対応**: `app/llm/` の抽象化レイヤー経由で呼び出すため、環境変数変更のみで切替可能

---

### 3-7. コンテナレジストリ

| 項目 | 値 |
|---|---|
| Kind | Deployment |
| Image | registry:2 |
| Replicas | 1 |
| Service Type | NodePort |
| Port | 5000 → NodePort 32500 |
| Storage | hostPath: `/var/lib/technomart-registry` |

**用途**: VM 内でビルドしたイメージを k3s に配布するローカルレジストリ

---

### 3-8. Backend（FastAPI）

| 項目 | 値 |
|---|---|
| Kind | Deployment |
| Image | 192.168.56.10:32500/technomart-backend:latest |
| Replicas | 1 |
| Service Type | **ClusterIP**（外部公開なし） |
| Port | 8000 |
| imagePullPolicy | Always |
| CPU Request/Limit | 250m / 500m |
| RAM Request/Limit | 256Mi / 512Mi |

**環境変数（ConfigMap: backend-config）**

| キー | 値 |
|---|---|
| POSTGRES_HOST | postgresql.technomart.svc.cluster.local |
| POSTGRES_PORT | 5432 |
| CLICKHOUSE_HOST | clickhouse.technomart.svc.cluster.local |
| CLICKHOUSE_PORT | 8123 |
| REDIS_URL | redis://redis.technomart.svc.cluster.local:6379/0 |
| KAFKA_BOOTSTRAP_SERVERS | kafka.technomart.svc.cluster.local:9092 |
| OLLAMA_BASE_URL | http://ollama.technomart.svc.cluster.local:11434 |
| S3_ENDPOINT_URL | http://localstack.technomart.svc.cluster.local:4566 |
| S3_BUCKET | technomart-datalake |
| JWT_ALGORITHM | HS256 |
| JWT_EXPIRE_MINUTES | 480 |

**環境変数（Secret: backend-secret）**

| キー | 生成方法 |
|---|---|
| POSTGRES_PASSWORD | deploy.sh で生成 |
| CLICKHOUSE_PASSWORD | deploy.sh で生成 |
| JWT_SECRET_KEY | `openssl rand -hex 32` で生成 |
| AWS_ACCESS_KEY_ID | `test`（LocalStack 固定値） |
| AWS_SECRET_ACCESS_KEY | `test`（LocalStack 固定値） |

**ヘルスチェック**

| 種別 | パス | 初期遅延 |
|---|---|---|
| Readiness Probe | GET /healthz | 10s |
| Liveness Probe | GET /healthz | 30s |

---

### 3-9. Frontend（Next.js）

| 項目 | 値 |
|---|---|
| Kind | Deployment |
| Image | 192.168.56.10:32500/technomart-frontend:latest |
| Replicas | 1 |
| Service Type | **ClusterIP**（外部公開なし） |
| Port | 3000 |
| imagePullPolicy | Always |
| CPU Request/Limit | 250m / 500m |
| RAM Request/Limit | 256Mi / 512Mi |
| ServiceAccount | frontend-sa |

**環境変数（ConfigMap: frontend-config）**

| キー | 値 |
|---|---|
| BACKEND_URL | http://backend.technomart.svc.cluster.local:8000 |
| NEXT_TELEMETRY_DISABLED | 1 |
| NODE_ENV | production |
| SECURE_COOKIES | true |
| NODE_EXTRA_CA_CERTS | /var/run/secrets/kubernetes.io/serviceaccount/ca.crt |

**環境変数（Secret: frontend-secret）**

| キー | 生成方法 |
|---|---|
| AUTH_COOKIE_SECRET | `openssl rand -hex 32`（JWT 検証に使用） |

**RBAC（frontend-sa）**: technomart Namespace の Pod と クラスター Nodes を get/list/watch

**ヘルスチェック**

| 種別 | パス | 初期遅延 |
|---|---|---|
| Readiness Probe | GET /auth/login | 15s |
| Liveness Probe | GET /auth/login | 30s |

---

### 3-10. Ingress（Nginx）

| 項目 | 値 |
|---|---|
| Controller | ingress-nginx v1.10.0（baremetal） |
| Namespace | ingress-nginx |
| HTTP NodePort | 31408 |
| HTTPS NodePort | 32239 |
| TLS Secret | technomart-tls（自己署名、CN=192.168.56.10） |

**ingress.yaml アノテーション**

```yaml
nginx.ingress.kubernetes.io/ssl-redirect: "true"
nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
nginx.ingress.kubernetes.io/proxy-body-size: "10m"
nginx.ingress.kubernetes.io/proxy-read-timeout: "60"
nginx.ingress.kubernetes.io/proxy-send-timeout: "60"
```

**ルーティング**

| パス | バックエンド | 備考 |
|---|---|---|
| `/` | frontend:3000 | Prefix マッチ、全トラフィック |

> **注意**: バックエンド API（`/api/ops/`, `/api/business/` 等）は Next.js のルートハンドラ（`app/api/**/route.ts`）が内部でバックエンドへプロキシする。Ingress から直接バックエンドへはルーティングしない。

---

### 3-11. Fluent Bit（ログ収集）

| 項目 | 値 |
|---|---|
| Kind | DaemonSet |
| Image | fluent/fluent-bit:3.2 |
| Input | Tail `/var/log/containers/*.log` |
| Output | S3（LocalStack）`/logs/%Y/%m/%d/$TAG[4].%H%M%S` |
| CPU Request/Limit | 50m / 200m |
| RAM Request/Limit | 64Mi / 128Mi |

---

### 3-12. CronJob 一覧

| Job 名 | スケジュール | コマンド |
|---|---|---|
| scoring-daily | `0 2 * * *`（毎日 02:00 UTC = 11:00 JST） | `python3 -m app.scoring.runner --mode daily` |
| scoring-weekly | `0 3 * * 0`（毎週日曜 03:00 UTC = 12:00 JST） | `python3 -m app.scoring.runner --mode weekly` |
| etl-pg-to-clickhouse | `0 19 * * *`（毎日 19:00 UTC = 04:00 JST） | `python3 -m app.pipelines.etl.pg_to_clickhouse` |

---

## 4. 認証・認可設計

### 4-1. 全体フロー

```
ブラウザ
  │ POST /api/auth/signin  (username / password)
  ▼
Next.js ルートハンドラ (/app/api/auth/signin/route.ts)
  │ fetch POST http://backend:8000/auth/login
  ▼
FastAPI LoginUseCase
  │ PostgreSQL app_users テーブルを検索
  │ bcrypt.checkpw(plain, hashed)
  │ jose.jwt.encode(payload, JWT_SECRET_KEY, HS256)
  ▼
  JWT トークン返却
  ▼
Next.js ルートハンドラ
  │ Set-Cookie: tm_session=<JWT>; HttpOnly; Secure; SameSite=Strict; Path=/
  ▼
ブラウザ（Cookie 保持）
  │ 以降のリクエストに Cookie が自動付与
  ▼
Next.js middleware.ts（Edge Runtime）
  │ Cookie から JWT 取得 → jose.jwtVerify() で検証
  │ ロールに応じてアクセス制御
  ▼
許可されたページ / API ルート
```

---

### 4-2. JWT 仕様

| 項目 | 値 |
|---|---|
| アルゴリズム | HS256 |
| 署名鍵 | `JWT_SECRET_KEY`（backend-secret）= `openssl rand -hex 32` で生成 |
| フロントエンド検証鍵 | `AUTH_COOKIE_SECRET`（frontend-secret）= 同じ値を共有 |
| 有効期限 | 480 分（8 時間） |
| Cookie 名 | `tm_session` |
| Cookie 属性 | `HttpOnly; Secure; SameSite=Strict; Path=/` |

**ペイロード構造**

```json
{
  "sub": "4",               // user_id（文字列）
  "username": "admin",
  "role": "admin",          // engineer / marketer / store_manager / admin
  "store_id": null,         // store_manager のみ非 null
  "exp": 1742395200         // Unix timestamp
}
```

---

### 4-3. ロール定義

| ロール | 説明 | アクセス可能パス |
|---|---|---|
| `engineer` | エンジニア・IT 部門 | `/ops/*` のみ |
| `marketer` | マーケティング部門（全店舗横断） | `/business/*` のみ |
| `store_manager` | 店長（自店舗データのみ） | `/business/*`（API が store_id で自動フィルタ） |
| `admin` | システム管理者 | `/ops/*` + `/business/*` 両方 |

**ログイン後のデフォルトリダイレクト先**

| ロール | ホーム |
|---|---|
| engineer / admin | `/ops/overview` |
| marketer / store_manager | `/business/summary` |

---

### 4-4. Next.js middleware.ts の動作

```
リクエスト到着
  │
  ├─ /_next/** / /api/ops/** / /api/business/**
  │    /api/auth/signout / /api/auth/me / /api/auth/users/**
  │    / / /api/healthz / /api/status/** / /status/**
  │    → NextResponse.next()（パススルー）
  │
  ├─ /auth/login または /api/auth/signin
  │    ├─ Cookie に有効なトークンあり → ロール別ホームへリダイレクト
  │    └─ なし → NextResponse.next()
  │
  └─ その他すべて
       ├─ Cookie なし / トークン無効 → /auth/login?from=<path> へリダイレクト
       ├─ ロールに対応するパスへのアクセス → NextResponse.next()
       └─ ロール不一致 → ロール別ホームへリダイレクト
```

**実行環境**: Edge Runtime（jose による軽量 JWT 検証）

---

### 4-5. ユーザー管理 API（admin 専用）

バックエンドに直接存在するエンドポイントを Next.js ルートハンドラが `/api/auth/users` に中継する。

| メソッド | パス | 説明 | 権限 |
|---|---|---|---|
| GET | `/api/auth/users` | ユーザー一覧取得 | admin のみ |
| POST | `/api/auth/users` | ユーザー新規作成 | admin のみ |
| PATCH | `/api/auth/users/{id}` | ロール変更・有効/無効切替 | admin のみ |

**制約**:
- `store_manager` を作成する場合は `store_id` 必須
- 自分自身のアカウントは変更不可
- パスワードは bcrypt（コスト係数 12）でハッシュ化して保存

**デフォルトユーザー**（初期 seed）

| username | role | store_id | password |
|---|---|---|---|
| engineer | engineer | null | engineer123 |
| marketer | marketer | null | marketer123 |
| store_manager | store_manager | 1 | storemanager123 |
| admin | admin | null | admin123 |

---

### 4-6. バックエンド認証の実装詳細

**LoginUseCase（`app/use_cases/auth/login.py`）**

```python
# 1. username でユーザー検索（is_active=False は除外）
record = await user_repo.find_by_username(username)

# 2. bcrypt でパスワード検証
bcrypt.checkpw(plain.encode(), hashed.encode())

# 3. JWT エンコード（python-jose）
payload = {
    "sub": str(user_id),
    "username": username,
    "role": role.value,
    "store_id": store_id,
    "exp": datetime.now(UTC) + timedelta(minutes=480),
}
jwt.encode(payload, JWT_SECRET_KEY, algorithm="HS256")
```

**get_current_user 依存関係**（全 protected エンドポイントで使用）

```python
# Authorization: Bearer <token> ヘッダーまたは Cookie から取得
# decode_token() が JWTError → 401 UnauthorizedError
```

---

## 5. アプリケーション API

### 5-1. バックエンド（FastAPI）エンドポイント一覧

**認証 `/auth`**

| メソッド | パス | 説明 |
|---|---|---|
| POST | `/auth/login` | ログイン（JWT 返却） |
| POST | `/auth/logout` | ログアウト（ステートレス、クライアント側 Cookie 削除） |
| GET | `/auth/me` | 現在のログインユーザー情報 |
| GET | `/auth/users` | ユーザー一覧（admin のみ） |
| POST | `/auth/users` | ユーザー作成（admin のみ） |
| PATCH | `/auth/users/{id}` | ユーザー更新（admin のみ） |

**Ops `/ops`**

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/ops/kafka/topics` | Kafka トピック一覧・オフセット情報 |
| GET | `/ops/pipelines` | パイプライン実行履歴 |
| GET | `/ops/scoring/status` | スコアリングバッチ実行状況 |
| GET | `/ops/schema` | PostgreSQL スキーマ情報 |

**Business `/business`**

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/business/customers` | 顧客一覧（store_manager は自店舗のみ） |
| GET | `/business/customers/{id}` | 顧客詳細（チャネル横断） |
| GET | `/business/segments` | 顧客セグメント分析 |
| GET | `/business/affinity` | カテゴリ親和性分析 |
| GET | `/business/summary` | KPI サマリー |
| GET | `/business/products/{id}/similar` | 類似商品検索（pgvector） |
| POST | `/business/query` | 自然言語クエリ（Ollama） |

**Status `/status`**

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/status/pods` | k8s Pod 稼働状況 |
| GET | `/status/pods/stream` | SSE ストリーム（リアルタイム更新） |
| GET | `/healthz` | ヘルスチェック |

### 5-2. Next.js API ルート（フロントエンドプロキシ）

Next.js の `app/api/**/route.ts` がバックエンドへのプロキシとして動作。
Cookie の JWT を `Authorization: Bearer` ヘッダーに変換して転送する。

| フロントエンドパス | 転送先 |
|---|---|
| `/api/auth/signin` | `POST http://backend:8000/auth/login` |
| `/api/auth/signout` | Cookie 削除 |
| `/api/auth/me` | `GET http://backend:8000/auth/me` |
| `/api/auth/users` | `GET/POST http://backend:8000/auth/users` |
| `/api/auth/users/[id]` | `PATCH http://backend:8000/auth/users/{id}` |
| `/api/ops/**` | `http://backend:8000/ops/**` |
| `/api/business/**` | `http://backend:8000/business/**` |
| `/api/status/**` | `http://backend:8000/status/**` |
| `/api/healthz` | `http://backend:8000/healthz` |

---

## 6. データパイプライン

### 6-1. データフロー全体

```
Synthetic Data（/infrastructure/data/）
  └─ Kafka プロデューサー（4種）
        ├─ ec_producer:    ec.events
        ├─ pos_producer:   pos.transactions
        ├─ app_producer:   app.behaviors
        └─ inv_producer:   inventory.updates
              ↓ Kafka (KRaft)
        ├─ pg_consumer    → PostgreSQL（staging テーブル）
        └─ s3_consumer    → S3 raw bucket（不変保持）
              ↓
        名寄せバッチ（deduplication --mode full）
              ↓ PostgreSQL unified_customers
        スコアリングバッチ（scoring --mode full）
              ├─ category_affinity（日次）
              ├─ churn_risk（週次）
              ├─ purchase_timing（週次）
              └─ visit_prediction（週次）
              ↓ ClickHouse 同期（clickhouse_connect HTTP）
              ↓
        ETL CronJob（04:00 JST 日次）
              └─ PostgreSQL staging → ClickHouse（ec_events / pos_transactions / sales_by_channel）
```

### 6-2. Embedding パイプライン

```
unified_products（全 23 件）
  │ WHERE embedding IS NULL
  ▼
Ollama API /api/embeddings（nomic-embed-text）
  ▼
vector(768) → unified_products.embedding（pgvector）
  ▼
GET /business/products/{id}/similar
  └─ pgvector <=> コサイン距離検索
```

### 6-3. ClickHouse ETL（pg_to_clickhouse.py）

毎日 04:00 JST（19:00 UTC）に前日分データを転送。

```python
# 実行方法
python3 -m app.pipelines.etl.pg_to_clickhouse --date YYYY-MM-DD
# デフォルト: 前日分
```

| 転送元（PostgreSQL） | 転送先（ClickHouse） | キー |
|---|---|---|
| staging_ec_events | ec_events | event_date |
| staging_pos_transactions | pos_transactions | transaction_date |
| 集計クエリ | sales_by_channel | date, channel |

### 6-4. スコアリング（runner.py）

```python
python3 -m app.scoring.runner --mode daily   # カテゴリ親和性
python3 -m app.scoring.runner --mode weekly  # チャーンリスク・購買タイミング・来店予測
python3 -m app.scoring.runner --mode full    # 全スコア + ClickHouse 同期
```

ClickHouse への書き込みには `clickhouse_connect`（HTTP クライアント）を使用。

---

## 7. デプロイ手順

### 7-1. 前提条件

ホストマシン（Windows）に以下がインストール済みであること。

- VirtualBox
- Vagrant
- Git
- Terraform v1.5+（LocalStack リソース管理に使用）

### 7-2. VM 起動・初回プロビジョニング

```bash
cd infrastructure/vagrant/production
vagrant up
# 約 10〜15 分（Ubuntu + k3s + Helm のインストール）

# VM への SSH 接続確認
vagrant ssh -c "kubectl get nodes"
# → technomart   Ready   control-plane,master
```

### 7-3. 全サービスのデプロイ

VM 内で実行（vagrant ssh または sync フォルダ経由）:

```bash
vagrant ssh -c "/technomart/infrastructure/scripts/deploy.sh"
```

**deploy.sh のステップ**

| ステップ | 内容 | 完了確認 |
|---|---|---|
| [0/8] Namespace | technomart Namespace 作成 | `kubectl get ns technomart` |
| [1/8] Kafka | KRaft モード StatefulSet | `kubectl rollout status statefulset/kafka -n technomart` |
| [2/8] Redis | Deployment | `kubectl rollout status deployment/redis -n technomart` |
| [3/8] PostgreSQL | pgvector Deployment + Secret 生成 | `kubectl rollout status deployment/postgresql -n technomart` |
| [4/8] ClickHouse | Deployment | `kubectl rollout status deployment/clickhouse -n technomart` |
| [5/8] LocalStack | S3 エミュレーション | `kubectl rollout status deployment/localstack -n technomart` |
| [6/8] Ollama | LLM + モデル pull（qwen2.5:3b / nomic-embed-text） | `kubectl rollout status deployment/ollama -n technomart --timeout=20m` |
| [7/8] Backend | Docker build → push → deploy | `kubectl rollout status deployment/backend -n technomart` |
| [8/8] Frontend | Docker build → push → deploy | `kubectl rollout status deployment/frontend -n technomart` |

**注意**: Ollama のモデル pull は初回に 数GB のダウンロードが発生する（約 10 分）。

### 7-4. Ingress のセットアップ

deploy.sh には含まれていない。初回のみ手動実行:

```bash
vagrant ssh

# Ingress Nginx Controller インストール
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.10.0/deploy/static/provider/baremetal/deploy.yaml

# NodePort を 31408(HTTP) / 32239(HTTPS) に固定パッチ
kubectl patch svc ingress-nginx-controller -n ingress-nginx \
  --type='json' \
  -p='[
    {"op":"replace","path":"/spec/ports/0/nodePort","value":31408},
    {"op":"replace","path":"/spec/ports/1/nodePort","value":32239}
  ]'

# 自己署名 TLS 証明書の生成
openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
  -keyout /tmp/tls.key \
  -out /tmp/tls.crt \
  -subj "/CN=192.168.56.10/O=Technomart"

# TLS Secret の作成
kubectl create secret tls technomart-tls \
  --cert=/tmp/tls.crt \
  --key=/tmp/tls.key \
  -n technomart

# Ingress リソースの適用
kubectl apply -f /technomart/infrastructure/k8s/ingress/ingress.yaml
```

### 7-5. Terraform（LocalStack S3 バケット）

```bash
cd infrastructure/terraform/localstack

terraform init
terraform plan
terraform apply
# → 4バケット作成（datalake / raw / aggregated / models）
```

既存バケットがある場合は import:
```bash
terraform import aws_s3_bucket.datalake technomart-datalake
```

### 7-6. フロントエンドのみ再ビルド

middleware など Next.js のコードを変更した場合:

```bash
vagrant ssh -c "
  REGISTRY='192.168.56.10:32500'
  TAG=\"\$(cat /technomart/VERSION | tr -d '[:space:]')-\$(git -C /technomart rev-parse --short HEAD)\"
  docker build -t \"\$REGISTRY/technomart-frontend:\$TAG\" \
               -t \"\$REGISTRY/technomart-frontend:latest\" \
               /technomart/application/frontend
  docker push \"\$REGISTRY/technomart-frontend:\$TAG\"
  docker push \"\$REGISTRY/technomart-frontend:latest\"
  kubectl set image deployment/frontend frontend=\"\$REGISTRY/technomart-frontend:\$TAG\" -n technomart
  kubectl rollout status deployment/frontend -n technomart --timeout=3m
"
```

### 7-7. バックエンドのみ再ビルド

```bash
vagrant ssh -c "
  REGISTRY='192.168.56.10:32500'
  TAG=\"\$(cat /technomart/VERSION | tr -d '[:space:]')-\$(git -C /technomart rev-parse --short HEAD)\"
  docker build -t \"\$REGISTRY/technomart-backend:\$TAG\" \
               -t \"\$REGISTRY/technomart-backend:latest\" \
               /technomart/application/backend
  docker push \"\$REGISTRY/technomart-backend:\$TAG\"
  docker push \"\$REGISTRY/technomart-backend:latest\"
  kubectl set image deployment/backend backend=\"\$REGISTRY/technomart-backend:\$TAG\" -n technomart
  kubectl rollout status deployment/backend -n technomart --timeout=3m
"
```

---

## 8. 初期データ投入（seed_all.sh）

デプロイ完了後、以下のスクリプト 1 本でデータを全て投入できる。

```bash
vagrant ssh -c "bash /technomart/infrastructure/scripts/seed_all.sh"
```

**内部ステップ**

| ステップ | 処理 | 備考 |
|---|---|---|
| [1] S3 バケット | awslocal で technomart-datalake / technomart-raw 確認・作成 | LocalStack 経由 |
| [2] Kafka トピック | 5 トピックの存在確認・作成 | partitions/replication 設定含む |
| [3] プロデューサー | ec / pos / app / inventory データ投入 | synthetic data から読み込み |
| [4] コンシューマー | pg_consumer・s3_consumer 実行 | PostgreSQL staging + S3 raw に書き込み |
| [5] 名寄せ | deduplication --mode full | unified_customers 構築 |
| [6] スコアリング | scoring --mode full | 全スコア計算 + ClickHouse 同期 |
| [7] Embedding | product_embeddings.py | 23 件の商品 Embedding 生成（nomic-embed-text） |

---

## 9. 運用・障害対応

### 9-1. Pod 稼働確認

```bash
vagrant ssh -c "kubectl get pods -n technomart"
```

**期待する状態（v1.2 正常時）**

| Pod | STATUS | RESTARTS |
|---|---|---|
| backend-* | Running | 0 |
| clickhouse-* | Running | 少数可 |
| fluent-bit-* | Running | 少数可 |
| frontend-* | Running | 0 |
| kafka-0 | Running | 0 |
| localstack-* | Running | 少数可 |
| ollama-* | Running | 少数可 |
| postgresql-* | Running | 少数可 |
| redis-* | Running | 少数可 |
| registry-* | Running | 少数可 |

### 9-2. ログ確認

```bash
# バックエンドログ
vagrant ssh -c "kubectl logs -n technomart deployment/backend -f"

# フロントエンドログ
vagrant ssh -c "kubectl logs -n technomart deployment/frontend -f"

# 特定 Pod
vagrant ssh -c "kubectl logs -n technomart kafka-0 -f"
```

### 9-3. Kafka オフセット確認

```bash
vagrant ssh -c "
  kubectl exec -n technomart kafka-0 -- \
    /opt/kafka/bin/kafka-consumer-groups.sh \
    --bootstrap-server localhost:9092 \
    --describe --group pg-writer
"
```

### 9-4. ディスク使用量

```bash
vagrant ssh -c "df -h /"
# 目標: 80% 以下
# v1.2 現状: 82%（Ollama 3.62GB + LocalStack 636MB が主要消費）

# Docker クリーンアップ
vagrant ssh -c "docker image prune -f"

# k3s 未使用イメージ削除
vagrant ssh -c "sudo k3s crictl rmi --prune"
```

### 9-5. スナップショット管理

```bash
cd infrastructure/vagrant/production

# 一覧確認
vagrant snapshot list
# → pre-v1.1.2 / v1.0-stable / v1.1-stable / v1.1.2-stable / v1.2-stable

# 保存
vagrant snapshot save "v1.x-stable"

# 復元
vagrant snapshot restore "v1.2-stable"
```

### 9-6. 障害シナリオ（v1.2 で検証済み）

| シナリオ | 結果 |
|---|---|
| `kubectl delete pod kafka-0` | 約 40 秒で復旧、offset は削除前と完全一致 |
| `kubectl rollout restart deployment/postgresql` | PVC によりデータ完全保持（unified_customers: 5106 件等） |
| コンシューマー再起動 | `pg-writer` GroupID の offset は Kafka 内部に保持され、続きから処理 |

### 9-7. 本番（AWS）移行時の変更点

| コンポーネント | ローカル → AWS |
|---|---|
| k3s | k3s → EKS |
| LocalStack | `endpoints {}` ブロック削除 → 実際の S3 |
| PostgreSQL | PVC → RDS PostgreSQL（接続情報のみ変更） |
| ClickHouse | PVC → ClickHouse Cloud / EC2 自己管理 |
| Redis | PVC → ElastiCache |
| Ollama | Ollama → Amazon Bedrock（抽象化レイヤー経由） |
| Registry | ローカルレジストリ → ECR |
| TLS 証明書 | 自己署名 → ACM / Let's Encrypt |
| JWT_SECRET_KEY | Secret → AWS Secrets Manager |

---

*このドキュメントは v1.2 の実装を反映しています。v1.3 以降（監視・オブザーバビリティ）では Prometheus / Grafana が追加される予定です。*
