#!/bin/bash
# ============================================================
# テクノマート 全データ初期投入スクリプト
# VM 内で vagrant ユーザーとして実行する
#
# 使い方:
#   /technomart/infrastructure/scripts/seed_all.sh
#
# 処理順序:
#   [1] S3 バケット作成（LocalStack）
#   [2] Kafka トピック確認
#   [3] Kafka プロデューサー実行（SQLite → Kafka）
#   [4] Kafka コンシューマー実行（Kafka → PostgreSQL staging / S3）
#   [5] 名寄せバッチ（full モード）
#   [6] スコアリングバッチ（full モード）
#   [7] 商品 Embedding 生成（pgvector）
# ============================================================

set -euo pipefail

NS="technomart"
BACKEND="deploy/backend"
SQLITE_PATH="/technomart/verification/technomart.db"

log() { echo "[$(date '+%H:%M:%S')] $*"; }
run_backend() {
  kubectl exec -n "$NS" "$BACKEND" -- python3 -m "$@"
}

log "======================================================"
log " テクノマート 全データ初期投入開始"
log "======================================================"

# ── [1] S3 バケット作成 ─────────────────────────────────
log ""
log "[1/7] S3 バケット作成（LocalStack）..."

# technomart-datalake（アプリ用・ログ用）
kubectl exec -n "$NS" deploy/localstack -- \
  awslocal s3 mb s3://technomart-datalake 2>/dev/null || true
# technomart-raw（Kafka raw データ保管用）
kubectl exec -n "$NS" deploy/localstack -- \
  awslocal s3 mb s3://technomart-raw 2>/dev/null || true

log "  S3 バケット確認:"
kubectl exec -n "$NS" deploy/localstack -- awslocal s3 ls

# ── [2] Kafka トピック確認 ──────────────────────────────
log ""
log "[2/7] Kafka トピック確認..."

REQUIRED_TOPICS="ec.events pos.transactions app.behaviors inventory.updates"
EXISTING=$(kubectl exec -n "$NS" kafka-0 -- \
  /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list 2>/dev/null)

for topic in $REQUIRED_TOPICS; do
  if echo "$EXISTING" | grep -q "^${topic}$"; then
    log "  OK: $topic"
  else
    log "  CREATE: $topic"
    kubectl exec -n "$NS" kafka-0 -- \
      /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 \
      --create --topic "$topic" --partitions 3 --replication-factor 1 2>/dev/null || true
  fi
done

# ── [3] Kafka プロデューサー実行 ────────────────────────
log ""
log "[3/7] Kafka プロデューサー実行（SQLite → Kafka）..."

log "  EC イベント..."
run_backend app.pipelines.producers.ec_producer \
  --sqlite-path "$SQLITE_PATH"

log "  POS トランザクション..."
run_backend app.pipelines.producers.pos_producer \
  --sqlite-path "$SQLITE_PATH"

log "  アプリ行動ログ..."
run_backend app.pipelines.producers.app_producer \
  --sqlite-path "$SQLITE_PATH"

log "  在庫変動..."
run_backend app.pipelines.producers.inventory_producer \
  --sqlite-path "$SQLITE_PATH"

# ── [4] Kafka コンシューマー実行 ────────────────────────
log ""
log "[4/7] Kafka コンシューマー実行..."

log "  PostgreSQL staging テーブルへ書き込み..."
run_backend app.pipelines.consumers.pg_consumer

log "  S3（LocalStack）へ書き出し..."
run_backend app.pipelines.consumers.s3_consumer

# ── [5] 名寄せバッチ ────────────────────────────────────
log ""
log "[5/7] 名寄せバッチ（full モード）..."
run_backend app.pipelines.deduplication.batch --mode full

# ── [6] スコアリングバッチ ──────────────────────────────
log ""
log "[6/7] スコアリングバッチ（full モード）..."
run_backend app.scoring.runner --mode full

# ── [7] 商品 Embedding 生成 ─────────────────────────────
log ""
log "[7/7] 商品 Embedding 生成（pgvector / nomic-embed-text）..."
run_backend app.pipelines.embeddings.product_embeddings

# ── 完了確認 ────────────────────────────────────────────
log ""
log "======================================================"
log " 全データ初期投入 完了!"
log "======================================================"
log ""
log "確認コマンド:"
log "  PG unified_customers: kubectl exec -n $NS deploy/postgresql -- psql -U technomart -d technomart -c 'SELECT COUNT(*) FROM unified_customers'"
log "  PG customer_scores:   kubectl exec -n $NS deploy/postgresql -- psql -U technomart -d technomart -c 'SELECT COUNT(*) FROM customer_scores'"
log "  PG product_embeddings: kubectl exec -n $NS deploy/postgresql -- psql -U technomart -d technomart -c 'SELECT COUNT(*) FROM unified_products WHERE embedding IS NOT NULL'"
log "  Redis score keys:     kubectl exec -n $NS deploy/redis -- redis-cli DBSIZE"
log "  ClickHouse:           wget -qO- 'http://localhost:30823/?user=technomart&password=technomart&query=SELECT+COUNT(*)+FROM+technomart.customer_scores_daily'"
