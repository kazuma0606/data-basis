#!/bin/bash
# テクノマート サービスデプロイスクリプト
# VM内で vagrant ユーザーとして実行する
# 使い方: /technomart/infrastructure/scripts/deploy.sh

set -euo pipefail

NAMESPACE="technomart"
K8S_DIR="/technomart/infrastructure/k8s"
APP_DIR="/technomart/application"

echo "======================================================"
echo " テクノマート インフラ デプロイ"
echo "======================================================"

# ── Namespace ─────────────────────────────────────────────
echo ""
echo "[0/6] Namespace..."
kubectl apply -f "$K8S_DIR/namespace.yaml"

# ── [1/6] Kafka ───────────────────────────────────────────
echo ""
echo "[1/6] Kafka（KRaft モード）..."
kubectl apply -f "$K8S_DIR/kafka/manifest.yaml"
kubectl rollout status statefulset/kafka -n "$NAMESPACE" --timeout=3m
echo "  OK: Kafka @ 192.168.56.10:32092"

# ── [2/6] Redis ───────────────────────────────────────────
echo ""
echo "[2/6] Redis..."
kubectl apply -f "$K8S_DIR/redis/manifest.yaml"
kubectl rollout status deployment/redis -n "$NAMESPACE" --timeout=2m
echo "  OK: Redis @ 192.168.56.10:32379"

# ── [3/6] PostgreSQL + pgvector ───────────────────────────
echo ""
echo "[3/6] PostgreSQL + pgvector..."
kubectl apply -f "$K8S_DIR/postgresql/manifest.yaml"
kubectl rollout status deployment/postgresql -n "$NAMESPACE" --timeout=3m
echo "  OK: PostgreSQL @ 192.168.56.10:32432  (db=technomart, user=technomart)"

# ── [4/6] ClickHouse ──────────────────────────────────────
echo ""
echo "[4/6] ClickHouse..."
kubectl apply -f "$K8S_DIR/clickhouse/manifest.yaml"
kubectl rollout status deployment/clickhouse -n "$NAMESPACE" --timeout=3m
echo "  OK: ClickHouse HTTP @ 192.168.56.10:30823 / native @ 192.168.56.10:30900"

# ── [5/6] LocalStack ──────────────────────────────────────
echo ""
echo "[5/6] LocalStack（S3）..."
kubectl apply -f "$K8S_DIR/localstack/manifest.yaml"
kubectl rollout status deployment/localstack -n "$NAMESPACE" --timeout=3m

# S3 バケット作成
echo "  S3 バケット作成中..."
until kubectl exec -n "$NAMESPACE" deploy/localstack -- curl -sf http://localhost:4566/_localstack/health 2>/dev/null | grep -q '"s3"'; do
  sleep 3
done
kubectl exec -n "$NAMESPACE" deploy/localstack -- \
  awslocal s3 mb s3://technomart-datalake --region ap-northeast-1 2>/dev/null || true
echo "  OK: LocalStack S3 @ http://192.168.56.10:31566 (bucket: technomart-datalake)"

# ── [6/6] Ollama ──────────────────────────────────────────
echo ""
echo "[6/6] Ollama..."
kubectl apply -f "$K8S_DIR/ollama/manifest.yaml"
kubectl rollout status deployment/ollama -n "$NAMESPACE" --timeout=5m

# モデルのプル（初回のみ時間がかかる）
echo "  Ollama モデル pull 中（初回は数〜十数分かかります）..."
OLLAMA_POD=$(kubectl get pod -n "$NAMESPACE" -l app=ollama -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n "$NAMESPACE" "$OLLAMA_POD" -- ollama pull nomic-embed-text
kubectl exec -n "$NAMESPACE" "$OLLAMA_POD" -- ollama pull gemma2
echo "  OK: Ollama @ http://192.168.56.10:31434"

# ── [7/7] Backend (FastAPI) ───────────────────────────────
echo ""
echo "[7/7] Backend (FastAPI)..."

# イメージビルド
echo "  Docker イメージをビルド中..."
docker build -t technomart-backend:latest "$APP_DIR/backend"

# k3s にインポート
echo "  k3s にインポート中..."
docker save technomart-backend:latest | k3s ctr images import -

# JWT_SECRET_KEY が未設定の場合は生成して Secret を作成
if ! kubectl get secret backend-secret -n "$NAMESPACE" &>/dev/null; then
  echo "  backend-secret を生成中..."
  JWT_SECRET=$(openssl rand -hex 32)
  kubectl create secret generic backend-secret \
    --from-literal=POSTGRES_PASSWORD=technomart \
    --from-literal=CLICKHOUSE_PASSWORD=technomart \
    --from-literal=JWT_SECRET_KEY="$JWT_SECRET" \
    --from-literal=AWS_ACCESS_KEY_ID=test \
    --from-literal=AWS_SECRET_ACCESS_KEY=test \
    -n "$NAMESPACE"
fi

kubectl apply -f "$K8S_DIR/backend/manifest.yaml"
kubectl rollout status deployment/backend -n "$NAMESPACE" --timeout=3m
echo "  OK: Backend API @ http://192.168.56.10:30800"

# ── 完了確認 ──────────────────────────────────────────────
echo ""
echo "======================================================"
echo " デプロイ完了!"
echo "======================================================"
echo ""
echo "サービス一覧:"
echo "  Kafka        192.168.56.10:32092"
echo "  Redis        192.168.56.10:32379"
echo "  PostgreSQL   192.168.56.10:32432  (db=technomart, user=technomart)"
echo "  ClickHouse   192.168.56.10:30823  (HTTP) / :30900 (native)"
echo "  LocalStack   http://192.168.56.10:31566  (S3: technomart-datalake)"
echo "  Ollama       http://192.168.56.10:31434"
echo "  Backend API  http://192.168.56.10:30800  (docs: /docs)"
echo ""
kubectl get pods -n "$NAMESPACE"
