# サービス接続情報

ホスト側からのアクセス（NodePort）と、k8s 内部 DNS（Pod 間通信）の両方を記載。

---

## アプリケーション

### フロントエンド (Next.js)

| 項目 | 値 |
|---|---|
| URL | http://192.168.56.10:30300 |
| NodePort | 30300 |
| ヘルスチェック | GET /auth/login (200) |

アクセスすると `/auth/login` に 307 リダイレクトされる。

**テストユーザー**:

| username | password | role | ログイン後 |
|---|---|---|---|
| `engineer` | `engineer123` | engineer | /ops/overview |
| `marketer` | `marketer123` | marketer | /business/summary |
| `store_manager` | `manager123` | store_manager | /business/summary (store_id=1でフィルタ) |

### バックエンド (FastAPI)

| 項目 | 値 |
|---|---|
| Base URL | http://192.168.56.10:30800 |
| NodePort | 30800 |
| Swagger UI | http://192.168.56.10:30800/docs |
| ヘルスチェック | GET /healthz → `{"status":"ok"}` |

```bash
# ヘルスチェック
curl http://192.168.56.10:30800/healthz

# ログイン（JWT トークン取得）
curl -s http://192.168.56.10:30800/auth/login \
  -X POST -H "Content-Type: application/json" \
  -d '{"username":"engineer","password":"engineer123"}' | jq .
```

---

## ミドルウェア

### PostgreSQL

| 項目 | 値 |
|---|---|
| ホスト | 192.168.56.10 |
| NodePort | 32432 |
| データベース | technomart |
| ユーザー | technomart |
| パスワード | technomart |
| 内部 DNS | `postgresql.technomart.svc.cluster.local:5432` |

```bash
# ホスト側から（psql がインストールされている場合）
psql -h 192.168.56.10 -p 32432 -U technomart -d technomart

# VM 内から kubectl exec
vagrant ssh -c "kubectl exec -n technomart deploy/postgresql -- \
  psql -U technomart -d technomart -c '\dt'"

# toolbox 経由（ENV 設定済みのため認証不要）
kubectl exec -it toolbox -n technomart -- bash
psql -c "SELECT count(*) FROM users;"
```

**主要テーブル**（v1.0 時点）:

| テーブル | 用途 |
|---|---|
| `users` | アプリユーザー（engineer / marketer / store_manager） |
| `unified_customers` | 名寄せ済み統合顧客マスタ |
| `customer_scores` | スコアリング結果 |

### ClickHouse

| 項目 | 値 |
|---|---|
| ホスト | 192.168.56.10 |
| HTTP ポート (NodePort) | 30823 |
| Native ポート (NodePort) | 30900 |
| データベース | technomart |
| ユーザー | technomart |
| パスワード | technomart |
| 内部 DNS | `clickhouse.technomart.svc.cluster.local:8123` |

```bash
# HTTP クエリ（ホスト側から）
curl "http://192.168.56.10:30823/?query=SELECT+1&user=technomart&password=technomart"

# テーブル一覧
curl "http://192.168.56.10:30823/?query=SHOW+TABLES+FROM+technomart&user=technomart&password=technomart"

# toolbox 経由（ClickHouse CLI は未インストール、curl を使う）
kubectl exec -it toolbox -n technomart -- bash
curl "http://clickhouse.technomart.svc.cluster.local:8123/?query=SELECT+1&user=technomart&password=technomart"
```

### Redis

| 項目 | 値 |
|---|---|
| ホスト | 192.168.56.10 |
| NodePort | 32379 |
| 内部 DNS | `redis.technomart.svc.cluster.local:6379` |
| 認証 | なし |

```bash
# ホスト側から（redis-cli がある場合）
redis-cli -h 192.168.56.10 -p 32379 ping

# toolbox 経由
kubectl exec -it toolbox -n technomart -- bash
redis-cli -h redis.technomart.svc.cluster.local ping
# → PONG

# キーの確認
redis-cli -h redis.technomart.svc.cluster.local keys "*"
```

### Kafka

| 項目 | 値 |
|---|---|
| Bootstrap Servers | 192.168.56.10:32092 |
| 内部 DNS | `kafka.technomart.svc.cluster.local:9092` |
| 方式 | KRaft (Zookeeper 不要) |

**トピック一覧**:

| トピック | パーティション | 用途 |
|---|---|---|
| `ec.events` | 3 | EC サイトのイベント（購入・閲覧・カート） |
| `pos.transactions` | 3 | POS の取引データ |
| `app.behaviors` | 3 | アプリの行動ログ (page_view, scroll_depth 等) |
| `inventory.updates` | 1 | 在庫更新 |
| `customer.scores` | 1 | スコアリング結果の配信 |

```bash
# トピック一覧（toolbox 経由 / kcat）
kubectl exec -it toolbox -n technomart -- bash
kcat -b kafka.technomart.svc.cluster.local:9092 -L

# 特定トピックのメッセージをリアルタイムで見る
kcat -b kafka.technomart.svc.cluster.local:9092 \
  -t ec.events -C -o end

# kubectl exec 経由で kafka-topics.sh を使う
kubectl exec -n technomart kafka-0 -- \
  /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 \
  --list
```

### LocalStack (S3)

| 項目 | 値 |
|---|---|
| Endpoint | http://192.168.56.10:31566 |
| NodePort | 31566 |
| リージョン | ap-northeast-1 |
| AWS_ACCESS_KEY_ID | test |
| AWS_SECRET_ACCESS_KEY | test |
| バケット | technomart-datalake |
| 内部 DNS | `localstack.technomart.svc.cluster.local:4566` |

```bash
# ホスト側から（AWS CLI が必要）
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
aws --endpoint-url=http://192.168.56.10:31566 s3 ls s3://technomart-datalake/

# toolbox 経由（awslocal ラッパーで endpoint 自動設定）
kubectl exec -it toolbox -n technomart -- bash
awslocal s3 ls
awslocal s3 ls s3://technomart-datalake/ --recursive
awslocal s3 ls s3://technomart-datalake/logs/  # Fluent Bit のログ
```

> **注意**: LocalStack はインメモリ動作のため、Pod 再起動でデータが消える。
> S3 バケットも再作成が必要。`deploy.sh` が自動で作成する。

### Ollama

| 項目 | 値 |
|---|---|
| Base URL | http://192.168.56.10:31434 |
| NodePort | 31434 |
| 内部 DNS | `ollama.technomart.svc.cluster.local:11434` |

**ロードされているモデル**:

| モデル | サイズ | 用途 |
|---|---|---|
| `nomic-embed-text` | 274MB | Embedding 生成（768次元） |
| `qwen2.5:3b` | 1.9GB | テキスト生成・日本語自然言語クエリ |

```bash
# モデル一覧
curl http://192.168.56.10:31434/api/tags | jq '.models[].name'

# 推論テスト（日本語）
curl http://192.168.56.10:31434/api/generate \
  -d '{"model":"qwen2.5:3b","prompt":"テクノマートの顧客について教えて","stream":false}' | jq .response

# Embedding 生成
curl http://192.168.56.10:31434/api/embeddings \
  -d '{"model":"nomic-embed-text","prompt":"高価格帯の商品を購入する顧客"}' | jq '.embedding | length'
# → 768
```

---

## ローカルレジストリ

| 項目 | 値 |
|---|---|
| URL | http://192.168.56.10:32500 |
| NodePort | 32500 |

```bash
# イメージ一覧
curl -s http://192.168.56.10:32500/v2/_catalog

# 特定イメージのタグ一覧
curl -s http://192.168.56.10:32500/v2/technomart-backend/tags/list
curl -s http://192.168.56.10:32500/v2/technomart-frontend/tags/list
curl -s http://192.168.56.10:32500/v2/technomart-toolbox/tags/list
```

現在登録済みのイメージ:

| イメージ | タグ |
|---|---|
| technomart-backend | v1.1-04b359d, latest |
| technomart-frontend | v1.1-04b359d, latest |
| technomart-toolbox | v1.1, latest |

---

## k8s 内部 DNS 早見表

Pod 間通信では以下のアドレスを使う（toolbox 内で確認済み）:

| サービス | 内部 DNS | ポート |
|---|---|---|
| PostgreSQL | postgresql.technomart.svc.cluster.local | 5432 |
| ClickHouse | clickhouse.technomart.svc.cluster.local | 8123 (HTTP) / 9000 (native) |
| Redis | redis.technomart.svc.cluster.local | 6379 |
| Kafka | kafka.technomart.svc.cluster.local | 9092 |
| Ollama | ollama.technomart.svc.cluster.local | 11434 |
| LocalStack | localstack.technomart.svc.cluster.local | 4566 |
| Backend | backend.technomart.svc.cluster.local | 8000 |
| Frontend | frontend.technomart.svc.cluster.local | 3000 |

DNS 解決の確認（toolbox 内）:

```bash
dig postgresql.technomart.svc.cluster.local +short
# → 10.43.x.x (ClusterIP)
```
