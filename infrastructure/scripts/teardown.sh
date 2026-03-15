#!/bin/bash
# テクノマート サービス削除スクリプト
# 使い方: /technomart/infrastructure/scripts/teardown.sh
# 注意: PVC（永続データ）も削除されます

set -euo pipefail

NAMESPACE="technomart"
K8S_DIR="/technomart/infrastructure/k8s"

echo "======================================================"
echo " テクノマート インフラ 削除"
echo "======================================================"
echo "警告: Namespace 'technomart' のリソースをすべて削除します。"
read -p "続けますか？ (yes/no): " confirm
[[ "$confirm" != "yes" ]] && { echo "キャンセルしました。"; exit 0; }

for manifest in ollama localstack clickhouse postgresql redis kafka; do
  echo "削除: $manifest"
  kubectl delete -f "$K8S_DIR/$manifest/manifest.yaml" --ignore-not-found
done

kubectl delete namespace "$NAMESPACE" --ignore-not-found

echo ""
echo "削除完了。再デプロイ: /technomart/infrastructure/scripts/deploy.sh"
