#!/bin/bash
# デプロイ状態確認スクリプト
# 使い方: versions/status.sh [--history] [--service <name>]

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DB="$SCRIPT_DIR/deployments.db"

if [ ! -f "$DB" ]; then
  echo "デプロイ記録がありません。deploy.sh を実行してください。"
  exit 0
fi

MODE="current"
SERVICE_FILTER=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --history|-h) MODE="history"; shift ;;
    --service|-s) SERVICE_FILTER="$2"; shift 2 ;;
    *) shift ;;
  esac
done

if [ "$MODE" = "current" ]; then
  echo "========================================"
  echo " 現在のデプロイ状態"
  echo "========================================"
  if [ -n "$SERVICE_FILTER" ]; then
    sqlite3 -header -column "$DB" \
      "SELECT environment, service, semver, git_hash, deployed_at
       FROM current_state
       WHERE service = '$SERVICE_FILTER'
       ORDER BY environment;"
  else
    sqlite3 -header -column "$DB" \
      "SELECT environment, service, semver, git_hash, deployed_at
       FROM current_state
       ORDER BY environment, service;"
  fi

else
  echo "========================================"
  echo " デプロイ履歴（直近20件）"
  echo "========================================"
  if [ -n "$SERVICE_FILTER" ]; then
    sqlite3 -header -column "$DB" \
      "SELECT deployed_at, environment, service, semver, git_hash, status, notes
       FROM deployments
       WHERE service = '$SERVICE_FILTER'
       ORDER BY id DESC
       LIMIT 20;"
  else
    sqlite3 -header -column "$DB" \
      "SELECT deployed_at, environment, service, semver, git_hash, status, notes
       FROM deployments
       ORDER BY id DESC
       LIMIT 20;"
  fi
fi
