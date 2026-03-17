#!/bin/bash
# ロールバックスクリプト
# 指定サービスを直前のバージョンに戻す
#
# 使い方:
#   versions/rollback.sh <env> <service>
#
# 例:
#   versions/rollback.sh prod backend

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DB="$SCRIPT_DIR/deployments.db"
NAMESPACE_MAP_PROD="technomart"
NAMESPACE_MAP_DEV="technomart-dev"

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <env> <service>" >&2
  exit 1
fi

ENV="$1"
SERVICE="$2"
NAMESPACE=$([ "$ENV" = "prod" ] && echo "$NAMESPACE_MAP_PROD" || echo "$NAMESPACE_MAP_DEV")

# 直前のsuccessデプロイを取得（現在の1つ前）
PREV=$(sqlite3 "$DB" \
  "SELECT image_ref, semver, git_hash FROM deployments
   WHERE environment = '$ENV' AND service = '$SERVICE' AND status = 'success'
   ORDER BY id DESC
   LIMIT 2;" | tail -1)

if [ -z "$PREV" ]; then
  echo "ロールバック先が見つかりません: $ENV/$SERVICE" >&2
  exit 1
fi

IMAGE_REF=$(echo "$PREV" | cut -d'|' -f1)
SEMVER=$(echo "$PREV" | cut -d'|' -f2)
GIT_HASH=$(echo "$PREV" | cut -d'|' -f3)

echo "ロールバック: $ENV/$SERVICE → $SEMVER ($GIT_HASH)"
echo "  image: $IMAGE_REF"
read -p "続行しますか？ [y/N] " CONFIRM
[ "$CONFIRM" != "y" ] && echo "キャンセルしました" && exit 0

kubectl set image deployment/"$SERVICE" "$SERVICE"="$IMAGE_REF" -n "$NAMESPACE"
kubectl rollout status deployment/"$SERVICE" -n "$NAMESPACE" --timeout=3m

# ロールバックをDBに記録
sqlite3 "$DB" <<SQL
INSERT INTO deployments
    (environment, service, semver, git_hash, image_ref, status, notes)
VALUES
    ('$ENV', '$SERVICE', '$SEMVER', '$GIT_HASH', '$IMAGE_REF', 'success', 'rollback');

INSERT OR REPLACE INTO current_state
    (environment, service, semver, git_hash, image_ref, deployed_at)
VALUES
    ('$ENV', '$SERVICE', '$SEMVER', '$GIT_HASH', '$IMAGE_REF', datetime('now', 'localtime'));
SQL

echo "  [versions] ロールバック完了: $ENV/$SERVICE $SEMVER ($GIT_HASH)"
