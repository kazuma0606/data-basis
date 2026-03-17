# toolbox コンテナ

Pod として常時起動しているデバッグ専用コンテナ。
クラスター内部のネットワーク・サービス疎通確認に使う。

---

## 基本的な使い方

```bash
# インタラクティブに入る
vagrant ssh -c "kubectl exec -it toolbox -n technomart -- bash"

# 1コマンドだけ実行する
vagrant ssh -c "kubectl exec toolbox -n technomart -- <コマンド>"
```

プロンプトが `root@toolbox:/#` になったらコンテナ内。

---

## インストール済みツール

| ツール | 用途 |
|---|---|
| `psql` | PostgreSQL 接続（ENV 設定済み → 認証不要） |
| `redis-cli` | Redis 接続 |
| `kcat` | Kafka トピック確認・メッセージ確認 |
| `curl` | HTTP 疎通確認・REST API テスト |
| `dig` / `nslookup` | DNS 解決確認 |
| `ping` | ICMP 疎通確認 |
| `nc` (netcat) | TCP ポート疎通確認 |
| `ss` / `ip` | ネットワーク状態確認 |
| `tcpdump` | パケットキャプチャ |
| `aws` + `awslocal` | LocalStack S3 操作 |
| `jq` | JSON パース |
| `vim` | ファイル編集 |

**未インストール**:
- ClickHouse CLI (`clickhouse-client`) — パッケージ依存の問題でスキップ。代わりに `curl` で HTTP API を使う

---

## ENV 変数（デフォルト設定済み）

```bash
PGHOST=postgresql.technomart.svc.cluster.local
PGPORT=5432
PGDATABASE=technomart
PGUSER=technomart
PGPASSWORD=technomart
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
AWS_DEFAULT_REGION=ap-northeast-1
```

これらは `manifest.yaml` の `env:` に静的に定義されている。
変更したい場合はマニフェストを更新して Pod を再作成する。

---

## サービス疎通チェック（一括）

起動直後やトラブル時に全サービスの疎通を確認する。

```bash
# toolbox に入った状態で実行

# PostgreSQL
psql -c "SELECT count(*) FROM users;"
# → count = 3（初期ユーザー数）

# Redis
redis-cli -h redis.technomart.svc.cluster.local ping
# → PONG

# Kafka（ブローカーとトピック一覧）
kcat -b kafka.technomart.svc.cluster.local:9092 -L
# → 5 トピック表示

# Backend API
curl -s http://backend.technomart.svc.cluster.local:8000/healthz
# → {"status":"ok"}

# LocalStack S3
awslocal s3 ls
# → technomart-datalake が表示（Pod 再起動直後は空の場合あり）

# ClickHouse（curl 経由）
curl -s "http://clickhouse.technomart.svc.cluster.local:8123/?query=SELECT+1&user=technomart&password=technomart"
# → 1

# Ollama
curl -s http://ollama.technomart.svc.cluster.local:11434/api/tags | jq '.models[].name'
# → nomic-embed-text, qwen2.5:3b

# DNS 解決
dig postgresql.technomart.svc.cluster.local +short
# → ClusterIP (10.43.x.x)
```

---

## PostgreSQL 操作

```bash
# テーブル一覧
psql -c "\dt"

# ユーザー確認
psql -c "SELECT username, role FROM users;"

# 行数確認（テーブルが存在する場合）
psql -c "SELECT COUNT(*) FROM unified_customers;"
psql -c "SELECT COUNT(*) FROM customer_scores;"

# 直近の変更を確認
psql -c "SELECT * FROM users ORDER BY created_at DESC LIMIT 5;"

# 別の DB に接続
psql -d postgres -c "\l"  # DB 一覧
```

---

## Kafka 操作

```bash
# トピック一覧と詳細
kcat -b kafka.technomart.svc.cluster.local:9092 -L

# 特定トピックのメッセージをリアルタイムで監視
kcat -b kafka.technomart.svc.cluster.local:9092 \
  -t ec.events -C -o end

# 最新 10 件のメッセージを取得して終了
kcat -b kafka.technomart.svc.cluster.local:9092 \
  -t pos.transactions -C -o -10 -e

# メッセージを JSON パースして見やすく表示
kcat -b kafka.technomart.svc.cluster.local:9092 \
  -t customer.scores -C -o end | jq .

# テストメッセージを送る
echo '{"test":"hello"}' | \
  kcat -b kafka.technomart.svc.cluster.local:9092 \
  -t ec.events -P
```

---

## LocalStack S3 操作

```bash
# awslocal は aws --endpoint-url=http://localstack:4566 のエイリアス

# バケット一覧
awslocal s3 ls

# バケット内のファイル一覧
awslocal s3 ls s3://technomart-datalake/ --recursive

# Fluent Bit のログを確認
awslocal s3 ls s3://technomart-datalake/logs/ --recursive | head -20

# ファイルをダウンロードして中身を見る（gzip 圧縮）
awslocal s3 cp s3://technomart-datalake/logs/2026/03/17/<filename> /tmp/log.gz
zcat /tmp/log.gz | head -20

# バケット作成（Pod 再起動でバケットが消えた場合）
awslocal s3 mb s3://technomart-datalake

# ファイルをアップロードする
echo "test" > /tmp/test.txt
awslocal s3 cp /tmp/test.txt s3://technomart-datalake/test/test.txt
```

---

## ClickHouse 操作（curl 経由）

```bash
# クエリ実行の基本形
curl -s "http://clickhouse.technomart.svc.cluster.local:8123/?user=technomart&password=technomart" \
  --data "SELECT 1"

# テーブル一覧
curl -s "http://clickhouse.technomart.svc.cluster.local:8123/?user=technomart&password=technomart" \
  --data "SHOW TABLES FROM technomart"

# データ件数確認
curl -s "http://clickhouse.technomart.svc.cluster.local:8123/?user=technomart&password=technomart" \
  --data "SELECT COUNT(*) FROM technomart.ec_events"
```

---

## ネットワーク診断

```bash
# Pod から別サービスへの TCP 疎通確認
nc -zv postgresql.technomart.svc.cluster.local 5432
nc -zv redis.technomart.svc.cluster.local 6379
nc -zv kafka.technomart.svc.cluster.local 9092

# DNS の正引き
dig kafka.technomart.svc.cluster.local
dig +short redis.technomart.svc.cluster.local

# クラスター外（インターネット）への疎通確認
curl -s https://example.com -o /dev/null -w "%{http_code}"

# パケットキャプチャ（PostgreSQL への通信を監視）
tcpdump -i eth0 -n port 5432
```

---

## toolbox 自体の管理

### Pod の状態確認

```bash
kubectl get pod toolbox -n technomart
kubectl describe pod toolbox -n technomart
```

### Pod の再起動

toolbox は `restartPolicy: Always` なので、削除すると自動的に再作成される。

```bash
kubectl delete pod toolbox -n technomart
# しばらく待つと自動で再作成される
kubectl wait --for=condition=Ready pod/toolbox -n technomart --timeout=2m
```

### イメージの更新

toolbox のコードを変更した場合（Dockerfile 修正など）:

```bash
# VM内で実行

# 1. イメージをビルド（リポジトリを VM にコピーしてから）
# ※ /vagrant/infrastructure/k8s/toolbox/ は直接マウントされていないため
#    /technomart/infrastructure/k8s/toolbox/ を使う
docker build -t 192.168.56.10:32500/technomart-toolbox:v1.1-new \
  -t 192.168.56.10:32500/technomart-toolbox:latest \
  /technomart/infrastructure/k8s/toolbox/

# 2. プッシュ
docker push 192.168.56.10:32500/technomart-toolbox:v1.1-new
docker push 192.168.56.10:32500/technomart-toolbox:latest

# 3. Pod を再起動（imagePullPolicy: Always なので削除するだけで OK）
kubectl delete pod toolbox -n technomart
```

---

## ファイル

| ファイル | 説明 |
|---|---|
| `infrastructure/k8s/toolbox/Dockerfile` | toolbox イメージ定義 |
| `infrastructure/k8s/toolbox/manifest.yaml` | Pod マニフェスト |
