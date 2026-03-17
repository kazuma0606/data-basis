#!/bin/bash
# デプロイ記録スクリプト
# deploy.sh から自動で呼び出す。手動実行も可能。
#
# 使い方:
#   versions/record.sh <env> <service> <semver> <git_hash> <image_ref> [notes]
#
# 例:
#   versions/record.sh prod backend v1.0.1 a3f9c12 \
#     localhost:5000/technomart-backend:v1.0.1-a3f9c12

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DB="$SCRIPT_DIR/deployments.db"

if [ "$#" -lt 5 ]; then
  echo "Usage: $0 <env> <service> <semver> <git_hash> <image_ref> [notes]" >&2
  exit 1
fi

ENV="$1"
SERVICE="$2"
SEMVER="$3"
GIT_HASH="$4"
IMAGE_REF="$5"
NOTES="${6:-}"
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")

# DB が未作成なら初期化
if [ ! -f "$DB" ]; then
  echo "  [versions] DB初期化中..."
  sqlite3 "$DB" < "$SCRIPT_DIR/schema.sql"
fi

sqlite3 "$DB" <<SQL
INSERT INTO deployments
    (environment, service, semver, git_hash, git_branch, image_ref, status, notes)
VALUES
    ('$ENV', '$SERVICE', '$SEMVER', '$GIT_HASH', '$BRANCH', '$IMAGE_REF', 'success', '$NOTES');

INSERT OR REPLACE INTO current_state
    (environment, service, semver, git_hash, image_ref, deployed_at)
VALUES
    ('$ENV', '$SERVICE', '$SEMVER', '$GIT_HASH', '$IMAGE_REF', datetime('now', 'localtime'));
SQL

echo "  [versions] 記録完了: $ENV/$SERVICE $SEMVER ($GIT_HASH)"
