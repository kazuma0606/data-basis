#!/bin/bash
# テクノマート サービスデプロイスクリプト
# VM内で vagrant ユーザーとして実行する
# 使い方: /technomart/infrastructure/scripts/deploy.sh [--env dev]

set -euo pipefail

# ── 環境設定 ──────────────────────────────────────────────
DEPLOY_ENV="${DEPLOY_ENV:-prod}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env) DEPLOY_ENV="$2"; shift 2 ;;
    *) shift ;;
  esac
done

NAMESPACE="technomart"
if [ "$DEPLOY_ENV" = "dev" ]; then
  NAMESPACE="technomart-dev"
fi

REGISTRY="192.168.56.10:32500"
K8S_DIR="/technomart/infrastructure/k8s"
APP_DIR="/technomart/application"
VERSIONS_DIR="/technomart/versions"

# バージョン情報
SEMVER=$(cat /technomart/VERSION | tr -d '[:space:]')
GIT_HASH=$(git -C /technomart rev-parse --short HEAD 2>/dev/null || echo "unknown")
TAG="${SEMVER}-${GIT_HASH}"

echo "======================================================"
echo " テクノマート インフラ デプロイ"
echo " 環境: ${DEPLOY_ENV} / Namespace: ${NAMESPACE}"
echo " バージョン: ${TAG}"
echo "======================================================"

# ── Namespace ─────────────────────────────────────────────
echo ""
echo "[0/8] Namespace..."
kubectl apply -f "$K8S_DIR/namespace.yaml"
if [ "$DEPLOY_ENV" = "dev" ]; then
  kubectl create namespace technomart-dev --dry-run=client -o yaml | kubectl apply -f -
fi

# ── [1/8] Kafka ───────────────────────────────────────────
echo ""
echo "[1/8] Kafka（KRaft モード）..."
kubectl apply -f "$K8S_DIR/kafka/manifest.yaml"
kubectl rollout status statefulset/kafka -n "$NAMESPACE" --timeout=3m
echo "  OK: Kafka @ 192.168.56.10:32092"

# ── [2/8] Redis ───────────────────────────────────────────
echo ""
echo "[2/8] Redis..."
kubectl apply -f "$K8S_DIR/redis/manifest.yaml"
kubectl rollout status deployment/redis -n "$NAMESPACE" --timeout=2m
echo "  OK: Redis @ 192.168.56.10:32379"

# ── [3/8] PostgreSQL + pgvector ───────────────────────────
echo ""
echo "[3/8] PostgreSQL + pgvector..."
kubectl apply -f "$K8S_DIR/postgresql/manifest.yaml"
kubectl rollout status deployment/postgresql -n "$NAMESPACE" --timeout=3m
echo "  OK: PostgreSQL @ 192.168.56.10:32432  (db=technomart, user=technomart)"

# ── [4/8] ClickHouse ──────────────────────────────────────
echo ""
echo "[4/8] ClickHouse..."
kubectl apply -f "$K8S_DIR/clickhouse/manifest.yaml"
kubectl rollout status deployment/clickhouse -n "$NAMESPACE" --timeout=3m
echo "  OK: ClickHouse HTTP @ 192.168.56.10:30823 / native @ 192.168.56.10:30900"

# ── [5/8] LocalStack ──────────────────────────────────────
echo ""
echo "[5/8] LocalStack（S3）..."
kubectl apply -f "$K8S_DIR/localstack/manifest.yaml"
kubectl rollout status deployment/localstack -n "$NAMESPACE" --timeout=3m

echo "  S3 バケット作成中..."
until kubectl exec -n "$NAMESPACE" deploy/localstack -- curl -sf http://localhost:4566/_localstack/health 2>/dev/null | grep -q '"s3"'; do
  sleep 3
done
kubectl exec -n "$NAMESPACE" deploy/localstack -- \
  awslocal s3 mb s3://technomart-datalake --region ap-northeast-1 2>/dev/null || true
echo "  OK: LocalStack S3 @ http://192.168.56.10:31566 (bucket: technomart-datalake)"

# ── [6/8] Ollama ──────────────────────────────────────────
echo ""
echo "[6/8] Ollama..."
kubectl apply -f "$K8S_DIR/ollama/manifest.yaml"
kubectl rollout status deployment/ollama -n "$NAMESPACE" --timeout=5m

echo "  Ollama モデル pull 中（初回は数〜十数分かかります）..."
OLLAMA_POD=$(kubectl get pod -n "$NAMESPACE" -l app=ollama -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n "$NAMESPACE" "$OLLAMA_POD" -- ollama pull nomic-embed-text
kubectl exec -n "$NAMESPACE" "$OLLAMA_POD" -- ollama pull qwen2.5:3b
echo "  OK: Ollama @ http://192.168.56.10:31434"

# ── [7/8] Backend (FastAPI) ───────────────────────────────
echo ""
echo "[7/8] Backend (FastAPI)..."

BACKEND_IMAGE="${REGISTRY}/technomart-backend:${TAG}"
BACKEND_IMAGE_LATEST="${REGISTRY}/technomart-backend:latest"

echo "  Docker イメージをビルド中... (${TAG})"
DOCKER_BUILDKIT=1 docker build -t "$BACKEND_IMAGE" -t "$BACKEND_IMAGE_LATEST" "$APP_DIR/backend"

echo "  レジストリに push 中..."
docker push "$BACKEND_IMAGE"
docker push "$BACKEND_IMAGE_LATEST"

# 古いイメージを削除（latest と今回タグ以外の technomart-backend タグを削除）
docker images "${REGISTRY}/technomart-backend" --format "{{.Tag}}" \
  | grep -v -E "^(latest|${TAG})$" \
  | xargs -r -I{} docker rmi "${REGISTRY}/technomart-backend:{}" 2>/dev/null || true
docker image prune -f

# Secret 生成（初回のみ）
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
kubectl set image deployment/backend backend="$BACKEND_IMAGE" -n "$NAMESPACE"
kubectl rollout status deployment/backend -n "$NAMESPACE" --timeout=3m
echo "  OK: Backend API @ http://192.168.56.10:30800"

# バージョン記録
bash "$VERSIONS_DIR/record.sh" "$DEPLOY_ENV" "backend" "$SEMVER" "$GIT_HASH" "$BACKEND_IMAGE"

# ── [8/8] Frontend (Next.js) ──────────────────────────────
echo ""
echo "[8/8] Frontend (Next.js)..."

FRONTEND_IMAGE="${REGISTRY}/technomart-frontend:${TAG}"
FRONTEND_IMAGE_LATEST="${REGISTRY}/technomart-frontend:latest"

echo "  Docker イメージをビルド中... (${TAG})"
DOCKER_BUILDKIT=1 docker build -t "$FRONTEND_IMAGE" -t "$FRONTEND_IMAGE_LATEST" "$APP_DIR/frontend"

echo "  レジストリに push 中..."
docker push "$FRONTEND_IMAGE"
docker push "$FRONTEND_IMAGE_LATEST"

# 古いイメージを削除（latest と今回タグ以外の technomart-frontend タグを削除）
docker images "${REGISTRY}/technomart-frontend" --format "{{.Tag}}" \
  | grep -v -E "^(latest|${TAG})$" \
  | xargs -r -I{} docker rmi "${REGISTRY}/technomart-frontend:{}" 2>/dev/null || true
docker image prune -f

# Secret 生成（初回のみ）
if ! kubectl get secret frontend-secret -n "$NAMESPACE" &>/dev/null; then
  echo "  frontend-secret を生成中..."
  COOKIE_SECRET=$(openssl rand -hex 32)
  kubectl create secret generic frontend-secret \
    --from-literal=AUTH_COOKIE_SECRET="$COOKIE_SECRET" \
    -n "$NAMESPACE"
fi

kubectl apply -f "$K8S_DIR/frontend/manifest.yaml"
kubectl set image deployment/frontend frontend="$FRONTEND_IMAGE" -n "$NAMESPACE"
kubectl rollout status deployment/frontend -n "$NAMESPACE" --timeout=3m
echo "  OK: Frontend @ http://192.168.56.10:30300"

# バージョン記録
bash "$VERSIONS_DIR/record.sh" "$DEPLOY_ENV" "frontend" "$SEMVER" "$GIT_HASH" "$FRONTEND_IMAGE"

# ── 完了確認 ──────────────────────────────────────────────
echo ""
echo "======================================================"
echo " デプロイ完了! [${DEPLOY_ENV}] ${TAG}"
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
echo "  Frontend     http://192.168.56.10:30300"
echo ""
kubectl get pods -n "$NAMESPACE"

echo ""
echo "デプロイ記録:"
bash "$VERSIONS_DIR/status.sh"

echo ""
echo "ディスク使用状況:"
df -h /
docker system df
