#!/bin/bash
# テクノマート サービスデプロイスクリプト
# VM内で vagrant ユーザーとして実行する
# 使い方: /technomart/infrastructure/scripts/deploy.sh

set -euo pipefail

NAMESPACE="technomart"
K8S_DIR="/technomart/infrastructure/k8s"

echo "======================================================"
echo " テクノマート インフラ デプロイ"
echo "======================================================"

# Helm リポジトリ更新
helm repo update

# ── Namespace ─────────────────────────────────────────────
echo ""
echo "[0/7] Namespace..."
kubectl apply -f "$K8S_DIR/namespace.yaml"

# ── [1/7] Kafka ───────────────────────────────────────────
echo ""
echo "[1/7] Kafka（KRaft モード）..."
helm upgrade --install kafka bitnami/kafka \
  --namespace "$NAMESPACE" \
  -f "$K8S_DIR/kafka/values.yaml" \
  --wait --timeout 5m
echo "  OK: Kafka @ 192.168.56.10:32092"

# ── [2/7] Redis ───────────────────────────────────────────
echo ""
echo "[2/7] Redis..."
helm upgrade --install redis bitnami/redis \
  --namespace "$NAMESPACE" \
  -f "$K8S_DIR/redis/values.yaml" \
  --wait --timeout 3m
echo "  OK: Redis @ 192.168.56.10:36379"

# ── [3/7] PostgreSQL + pgvector ───────────────────────────
echo ""
echo "[3/7] PostgreSQL + pgvector..."
kubectl apply -f "$K8S_DIR/postgresql/manifest.yaml"
kubectl rollout status deployment/postgresql -n "$NAMESPACE" --timeout=3m
echo "  OK: PostgreSQL @ 192.168.56.10:35432  (db=technomart, user=technomart)"

# ── [4/7] ClickHouse ──────────────────────────────────────
echo ""
echo "[4/7] ClickHouse..."
kubectl apply -f "$K8S_DIR/clickhouse/manifest.yaml"
kubectl rollout status deployment/clickhouse -n "$NAMESPACE" --timeout=3m
echo "  OK: ClickHouse HTTP @ 192.168.56.10:38123 / native @ 192.168.56.10:39000"

# ── [5/7] LocalStack ──────────────────────────────────────
echo ""
echo "[5/7] LocalStack（S3）..."
kubectl apply -f "$K8S_DIR/localstack/manifest.yaml"
kubectl rollout status deployment/localstack -n "$NAMESPACE" --timeout=3m

# S3 バケット作成
echo "  S3 バケット作成中..."
until curl -sf http://localhost:34566/_localstack/health | grep -q '"s3": "running"'; do
  sleep 3
done
AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
  aws --endpoint-url=http://192.168.56.10:34566 s3 mb s3://technomart-datalake --region ap-northeast-1 2>/dev/null || true
echo "  OK: LocalStack S3 @ http://192.168.56.10:34566 (bucket: technomart-datalake)"

# ── [6/7] Ollama ──────────────────────────────────────────
echo ""
echo "[6/7] Ollama..."
kubectl apply -f "$K8S_DIR/ollama/manifest.yaml"
kubectl rollout status deployment/ollama -n "$NAMESPACE" --timeout=5m

# モデルのプル（初回のみ時間がかかる）
echo "  Ollama モデル pull 中（初回は数分かかります）..."
OLLAMA_POD=$(kubectl get pod -n "$NAMESPACE" -l app=ollama -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n "$NAMESPACE" "$OLLAMA_POD" -- ollama pull nomic-embed-text
kubectl exec -n "$NAMESPACE" "$OLLAMA_POD" -- ollama pull gemma2
echo "  OK: Ollama @ http://192.168.56.10:31434"

# ── [7/7] 完了確認 ────────────────────────────────────────
echo ""
echo "======================================================"
echo " デプロイ完了!"
echo "======================================================"
echo ""
echo "サービス一覧:"
echo "  Kafka        192.168.56.10:32092"
echo "  Redis        192.168.56.10:36379"
echo "  PostgreSQL   192.168.56.10:35432  (db=technomart, user=technomart)"
echo "  ClickHouse   192.168.56.10:38123  (HTTP) / :39000 (native)"
echo "  LocalStack   http://192.168.56.10:34566  (S3)"
echo "  Ollama       http://192.168.56.10:31434"
echo ""
kubectl get pods -n "$NAMESPACE"
