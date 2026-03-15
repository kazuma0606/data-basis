#!/bin/bash
# テクノマート 初期データ投入スクリプト
# VM内で vagrant ユーザーとして実行する
#
# 使い方:
#   /technomart/infrastructure/scripts/initial_data.sh           # デフォルト 5000人
#   /technomart/infrastructure/scripts/initial_data.sh 10000     # 人数を指定

set -euo pipefail

CUSTOMERS=${1:-5000}
PIPELINE_DIR="/technomart/infrastructure/data_pipeline"
DATA_DIR="/tmp/technomart_data"

echo "======================================================"
echo " テクノマート 初期データ投入"
echo " 顧客数: ${CUSTOMERS}人 / データ出力先: ${DATA_DIR}"
echo "======================================================"

cd "$PIPELINE_DIR"

# ── 依存ライブラリのインストール ──────────────────────
echo ""
echo "[0/5] Python 環境セットアップ..."
if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi
source .venv/bin/activate
pip install -q -r requirements.txt

# ── [1/5] CSV データ生成 ──────────────────────────────
echo ""
echo "[1/5] Synthetic Data 生成 (${CUSTOMERS}人)..."
DATA_DIR="$DATA_DIR" python generate.py --customers "$CUSTOMERS"

# ── [2/5] PostgreSQL ──────────────────────────────────
echo ""
echo "[2/5] PostgreSQL へロード..."
DATA_DIR="$DATA_DIR" python load_postgresql.py

# ── [3/5] ClickHouse ──────────────────────────────────
echo ""
echo "[3/5] ClickHouse へロード..."
DATA_DIR="$DATA_DIR" python load_clickhouse.py

# ── [4/5] Kafka ───────────────────────────────────────
echo ""
echo "[4/5] Kafka へプロデュース..."
DATA_DIR="$DATA_DIR" python produce_kafka.py

# ── [5/5] LocalStack S3 ───────────────────────────────
echo ""
echo "[5/5] LocalStack S3 へアップロード..."
DATA_DIR="$DATA_DIR" python upload_s3.py

# ── 完了確認 ──────────────────────────────────────────
echo ""
echo "======================================================"
echo " 初期データ投入 完了!"
echo "======================================================"
echo ""
echo "確認コマンド:"
echo "  PostgreSQL: psql -h 127.0.0.1 -p 32432 -U technomart -d technomart -c 'SELECT COUNT(*) FROM unified_customers;'"
echo "  ClickHouse: curl -s 'http://127.0.0.1:30823/?query=SELECT+COUNT(*)+FROM+technomart.ec_events&user=technomart&password=technomart'"
echo "  Kafka:      kubectl exec -n technomart kafka-0 -- /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 --list"
echo "  S3:         awslocal --endpoint-url=http://127.0.0.1:31566 s3 ls s3://technomart-datalake/ --recursive --human-readable"
