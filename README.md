# data-basis

中規模リテール企業向けデータ基盤のローカル構築プロジェクト。

VirtualBox VM上に本番AWS環境の縮小再現を構築し、複数システムに分散した顧客データを統合・活用するデータ基盤とアプリケーション層を実装する。

---

## 想定ユースケース

架空クライアント「株式会社テクノマート」（家電量販店チェーン、10店舗、会員20万人）を対象に、以下を実現する。

- **チャネル横断の顧客統合**: ECサイト・実店舗POS・会員アプリにサイロ化したデータを名寄せして統合顧客マスタを構築する
- **潜在顧客スコアリング**: 閲覧・購買・来店の弱いシグナルを積み上げてカテゴリ親和性スコアを算出し、バッチでサジェストを生成する
- **チャーン分析**: アクティブ/休眠/チャーンを分類し、マーケ施策のターゲティングに使う

---

## 技術スタック

| レイヤー | ローカル環境 | 本番（AWS想定） |
|---|---|---|
| コンテナ基盤 | k8s on VirtualBox VM | EKS |
| ストリーミング | Kafka | Amazon MSK |
| オブジェクトストレージ | LocalStack (S3互換) | S3 |
| アプリDB | PostgreSQL + pgvector | RDS PostgreSQL |
| 分析DB | ClickHouse | ClickHouse on EC2 |
| キャッシュ | Redis | ElastiCache |
| LLM | Ollama (Gemma2, nomic-embed-text) | Amazon Bedrock |
| IaC | Terraform (LocalStack provider) | Terraform (AWS provider) |
| フロントエンド | Next.js + ShadCN | 同左 |
| バックエンド | FastAPI + SQLAlchemy | 同左 |

外部LLM API（Claude API, OpenAI等）は使用しない。

---

## リポジトリ構成

```
data-basis/
  v1.0/                   # プロジェクト全体の要件・設計ドキュメント（v1.0）
  infrastructure/
    vagrant/              # VM管理（Vagrantfile）← VM起動はここ
    k8s/                  # Kubernetesマニフェスト（backend / frontend / 各ミドルウェア）
    kafka/                # Kafkaトピック・コネクタ設定
    scripts/              # デプロイ・データ初期化・DB移行スクリプト
  application/
    frontend/             # Next.js 15 + ShadCN + TypeScript
    backend/              # FastAPI + SQLAlchemy（非同期）
    example/              # デザインモック（v0.app）
  verification/           # ローカル検証（SQLiteベース）
  DEV_NOTES.md            # 開発ノート（詰まったポイントと解決策）
```

---

## VM 動作環境

### ホストマシン要件

| 項目 | 現在の設定 | 備考 |
|---|---|---|
| CPU | 10コア割り当て | ホスト: Intel Core Ultra 7 265KF |
| RAM | **48GB 割り当て（仮置き）** | 後述 |
| ディスク | 200GB | k3s イメージキャッシュで消費しやすい |
| OS | Ubuntu 24.04 LTS (on VirtualBox) | ホスト: Windows 11 |

### RAM 設定について（仮置き・実測予定）

**現在の 48GB は仮置きの値**であり、実際の要件は今後の実測で決定する。

| 時点 | アイドル時の実測値 | 状況 |
|---|---|---|
| v1.1.2 完了時 | **約 4GB**（割り当ての 8%） | アプリ + ミドルウェア一式稼働中 |
| v1.2 完了後 | 未計測 | Kafka パイプライン・スコアリングバッチ追加 |
| v1.3 完了後 | 未計測 | 監視スタック（Prometheus/Grafana 等）追加で +2GB 見込み |

実測は **v1.2.1**（v1.2 完了後のベースライン）と **v1.3.1**（監視スタック込みのピーク計測）で実施予定。
計測結果に応じて Vagrantfile の `vb.memory` を更新し、一般的なローカル PC での最小要件を明示する。

> **現時点での目安**: アイドルのみなら 8GB 以上で動作する見込み。
> 負荷テスト・Ollama 推論・スコアリングバッチを同時実行した場合のピークは未計測。

---

## クイックスタート

### 1. 検証環境（SQLite）

本番VM構築の前に、SQLiteベースで汚れたSynthetic Dataを生成・確認できる。

```bash
cd verification
uv run python generate.py        # 500人分のデータ生成
uv run python verify.py          # 検証レポート表示
```

**検証で確認できる内容:**
- 同一人物が EC / POS / アプリに別IDで存在（名寄せ対象）
- 電話番号フォーマットの5種混在、和暦/西暦の混在、都道府県表記の揺れ
- チャーン分布（active 20% / dormant 40% / churned 30% / dead 10%）
- 退会処理漏れ（チャーン顧客の約90%が削除フラグなし）
- EC / POS 間の商品コード体系の差異

---

### 2. VM起動とk3sデプロイ

```bash
cd infrastructure/vagrant
vagrant up          # VM起動（初回は数分かかる）

# VMに入って全サービスをデプロイ
vagrant ssh
/technomart/infrastructure/scripts/deploy.sh
```

**デプロイ後のエンドポイント:**

| サービス | URL |
|---|---|
| フロントエンド | http://192.168.56.10:30300 |
| バックエンド API | http://192.168.56.10:30800 |
| API ドキュメント | http://192.168.56.10:30800/docs |
| PostgreSQL | 192.168.56.10:32432 |
| ClickHouse | http://192.168.56.10:30823 |
| Kafka | 192.168.56.10:30092 |
| LocalStack | http://192.168.56.10:31566 |
| Ollama | http://192.168.56.10:31434 |

---

### 3. DBの初期化とユーザーシード

デプロイ直後はテーブルとテストユーザーが存在しない。以下の手順で初期化する。

```bash
KEY="infrastructure/vagrant/production/.vagrant/machines/default/virtualbox/private_key"

# SQLファイルをVMに転送
scp -i "$KEY" -o StrictHostKeyChecking=no \
  infrastructure/scripts/create_tables.sql \
  infrastructure/scripts/seed_users.sql \
  vagrant@192.168.56.10:/tmp/

# PostgreSQL Pod にコピーして実行
PGPOD=$(ssh -i "$KEY" vagrant@192.168.56.10 \
  "kubectl get pod -n technomart -l app=postgresql -o jsonpath='{.items[0].metadata.name}'")

ssh -i "$KEY" vagrant@192.168.56.10 "
  kubectl cp /tmp/create_tables.sql technomart/${PGPOD}:/tmp/create_tables.sql
  kubectl cp /tmp/seed_users.sql    technomart/${PGPOD}:/tmp/seed_users.sql
  kubectl exec -n technomart ${PGPOD} -- psql -U technomart -d technomart -f /tmp/create_tables.sql
  kubectl exec -n technomart ${PGPOD} -- psql -U technomart -d technomart -f /tmp/seed_users.sql
"
```

**初期データ投入（Synthetic Data）** はVMログイン後に実行:

```bash
/technomart/infrastructure/scripts/initial_data.sh       # デフォルト 5000人
/technomart/infrastructure/scripts/initial_data.sh 1000  # 人数を指定
```

データ投入後、スキーマをバックエンドモデルに合わせるための移行も実行する:

```bash
scp -i "$KEY" infrastructure/scripts/migrate_schema.sql vagrant@192.168.56.10:/tmp/
ssh -i "$KEY" vagrant@192.168.56.10 "
  kubectl cp /tmp/migrate_schema.sql technomart/${PGPOD}:/tmp/migrate_schema.sql
  kubectl exec -n technomart ${PGPOD} -- psql -U technomart -d technomart -f /tmp/migrate_schema.sql
"
```

---

### 4. テスト実行

**フロントエンド（ローカル）**

```bash
cd application/frontend

# .env.local が存在することを確認（バックエンドのJWT秘密鍵と一致させること）
cat .env.local
# BACKEND_URL=http://192.168.56.10:30800
# AUTH_COOKIE_SECRET=<JWT_SECRET_KEYと同じ値>

# ユニット・コンポーネントテスト（JestでVMなしで実行可）
npx jest

# E2Eテスト（VMとバックエンドが起動していること）
npx playwright install chromium   # 初回のみ
npx playwright test
```

**テストユーザー（E2E用）:**

| username | password | role | アクセス先 |
|---|---|---|---|
| engineer | engineer123 | engineer | /ops/* |
| marketer | marketer123 | marketer | /business/* |
| store_manager | manager123 | store_manager | /business/* |

---

## アプリケーション概要

### ロールとルーティング

| ロール | アクセス先 | 用途 |
|---|---|---|
| `engineer` | `/ops/*` | Kafka監視・パイプライン・スキーマ参照 |
| `marketer` | `/business/*` | 全店舗横断の顧客分析・セグメント・クエリ |
| `store_manager` | `/business/*` | 自店舗データのみ（APIで自動フィルタ） |
| `admin` | 両方 | - |

### 認証アーキテクチャ

`lib/auth/` でプロバイダを抽象化。現在は FastAPI JWT（HS256）を使用。将来的に Cognito 等へ切り替える場合は `lib/auth/index.ts` の1行変更のみで対応できる設計。

```
lib/auth/
  providers/fastapi.ts  # 現在のプロバイダ
  index.ts              # ← 切り替えはここだけ
  session.ts            # Server Components / middleware 用
  client.tsx            # Client Components 用（AuthContext）
```

---

## 設計ドキュメント

| ファイル | 内容 |
|---|---|
| `v1.0/company.md` | 発注元（テクノマート）の背景・制約・プロジェクト構図 |
| `v1.0/user_story.md` | ユーザーストーリー・潜在スコアリング設計 |
| `v1.0/data_problems.md` | 既存データの問題点・Synthetic Data方針 |
| `v1.0/architecture.md` | インフラ全体構成・本番/ローカルの対応表 |
| `v1.0/data_schema.md` | テーブル設計・Kafkaトピック対応 |
| `application/plan/app_requirements.md` | ダッシュボード・API・認証設計 |
| `DEV_NOTES.md` | 開発ノート（実装・テストで詰まったポイントと解決策） |
