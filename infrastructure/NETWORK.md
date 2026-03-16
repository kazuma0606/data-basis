# ネットワーク・ポート構成

## VM

| 項目 | 値 |
|---|---|
| IPアドレス | `192.168.56.10`（Host-Only） |
| OS | Ubuntu 24.04 LTS |
| スペック | 10コア / 48GB RAM |
| k8s | k3s v1.34.5 |
| Namespace | `technomart` |

## サービス一覧（ホストからのアクセス）

| サービス | イメージ | NodePort | アクセス先 |
|---|---|---|---|
| Kafka | `apache/kafka:3.9.0` | 32092 | `192.168.56.10:32092` |
| Redis | `redis:7-alpine` | 32379 | `192.168.56.10:32379` |
| PostgreSQL + pgvector | `pgvector/pgvector:pg16` | 32432 | `192.168.56.10:32432` |
| ClickHouse (HTTP) | `clickhouse/clickhouse-server:24.8` | 30823 | `http://192.168.56.10:30823` |
| ClickHouse (native) | 同上 | 30900 | `192.168.56.10:30900` |
| LocalStack (S3) | `localstack/localstack:3.8` | 31566 | `http://192.168.56.10:31566` |
| Ollama | `ollama/ollama:latest` | 31434 | `http://192.168.56.10:31434` |

## 接続情報

### PostgreSQL
```
host:     192.168.56.10
port:     32432
database: technomart
user:     technomart
password: technomart
```

### ClickHouse
```
host:     192.168.56.10
http_port: 30823
tcp_port:  30900
database: technomart
user:     technomart
password: technomart
```

### LocalStack S3
```
endpoint_url: http://192.168.56.10:31566
region:       ap-northeast-1
bucket:       technomart-datalake
# 認証はダミー値で可
aws_access_key_id:     test
aws_secret_access_key: test
```

### Ollama
```
base_url: http://192.168.56.10:31434
models:
  - nomic-embed-text  # Embedding生成（768次元、274MB）
  - qwen2.5:3b        # テキスト生成・自然言語クエリ（日本語対応、1.9GB）
# ※ llama4はVirtualBox CPU環境では非実用的なサイズ（67GB）。本番はBedrock(llama4)を想定。
```

### Kafka
```
bootstrap_servers: 192.168.56.10:32092
topics:
  - ec.events          (partitions: 3, retention: 7日)
  - pos.transactions   (partitions: 3, retention: 7日)
  - app.behaviors      (partitions: 3, retention: 7日)
  - inventory.updates  (partitions: 1, retention: 7日)
  - customer.scores    (partitions: 1, retention: 1日)
```

## アプリケーション

| サービス | イメージ | NodePort | アクセス先 |
|---|---|---|---|
| Backend (FastAPI) | `technomart-backend:latest` | 30800 | `http://192.168.56.10:30800` |
| Frontend (Next.js) | `technomart-frontend:latest`（未デプロイ） | 30300 | `http://192.168.56.10:30300` |

### Backend API

```
base_url:  http://192.168.56.10:30800
docs:      http://192.168.56.10:30800/docs
healthz:   http://192.168.56.10:30800/healthz
```

### k3s 内部 DNS（Pod 間通信）

| サービス | 内部アドレス |
|---|---|
| PostgreSQL | `postgresql.technomart.svc.cluster.local:5432` |
| ClickHouse | `clickhouse.technomart.svc.cluster.local:8123` |
| Redis | `redis.technomart.svc.cluster.local:6379` |
| Kafka | `kafka.technomart.svc.cluster.local:9092` |
| Ollama | `ollama.technomart.svc.cluster.local:11434` |
| LocalStack | `localstack.technomart.svc.cluster.local:4566` |
