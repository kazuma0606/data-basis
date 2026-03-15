#!/bin/bash
# テクノマート VM プロビジョニングスクリプト
# k3s（軽量 Kubernetes）と Helm をセットアップする
# サービスのデプロイは deploy.sh で別途実行する

set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

echo "======================================================"
echo " テクノマート VM プロビジョニング"
echo "======================================================"

# ── [1/4] 基本ツール ──────────────────────────────────────
echo ""
echo "[1/4] 基本ツールのインストール..."
apt-get update -qq
apt-get install -y -qq curl git unzip jq

# ── [2/4] k3s インストール ────────────────────────────────
echo ""
echo "[2/4] k3s インストール中..."
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--disable traefik --write-kubeconfig-mode 644" sh -

echo "k3s 起動待ち..."
until kubectl get nodes 2>/dev/null | grep -q " Ready"; do
  sleep 3
done
echo "k3s 起動完了: $(kubectl get nodes --no-headers | awk '{print $1, $2}')"

# ── [3/4] kubeconfig セットアップ ─────────────────────────
echo ""
echo "[3/4] kubeconfig セットアップ..."
mkdir -p /home/vagrant/.kube
cp /etc/rancher/k3s/k3s.yaml /home/vagrant/.kube/config
chown -R vagrant:vagrant /home/vagrant/.kube
chmod 600 /home/vagrant/.kube/config

cat >> /home/vagrant/.bashrc <<'BASHRC'

# テクノマート 開発環境
export KUBECONFIG=/home/vagrant/.kube/config
alias k=kubectl
alias kn='kubectl -n technomart'
BASHRC

# ── [4/4] Helm インストール ───────────────────────────────
echo ""
echo "[4/4] Helm インストール中..."
curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

# Helm リポジトリ（vagrant ユーザーとして実行）
sudo -u vagrant -E KUBECONFIG=/home/vagrant/.kube/config bash -c "
  helm repo add bitnami https://charts.bitnami.com/bitnami
  helm repo update
"

echo ""
echo "======================================================"
echo " プロビジョニング完了!"
echo "======================================================"
echo ""
echo "次のステップ（VM内で実行）:"
echo "  vagrant ssh"
echo "  /technomart/infrastructure/scripts/deploy.sh"
echo ""
kubectl get nodes
