# テクノマート データ基盤 — 運用マニュアル

バージョン: v1.1 / 最終更新: 2026-03-17

---

## このマニュアルについて

ローカル環境（VirtualBox + k3s）で稼働するテクノマートデータ基盤の
日常的な操作手順をまとめたもの。
セットアップの設計背景は `v1.0/plan.md` ～ `v1.3/plan.md` を参照。

---

## ドキュメント一覧

| ファイル | 内容 |
|---|---|
| [vm.md](vm.md) | VM の起動・停止・スナップショット・トラブル対応 |
| [deploy.md](deploy.md) | アプリのビルドとデプロイ手順 |
| [services.md](services.md) | 各サービスへの接続方法・認証情報 |
| [toolbox.md](toolbox.md) | toolbox コンテナによる疎通確認・デバッグ |
| [versions.md](versions.md) | バージョン管理・ロールバック |
| [debug.md](debug.md) | よくある障害パターンと対処法 |

---

## クイックリファレンス

### VM 操作

```bash
# 作業ディレクトリ
cd infrastructure/vagrant/production

vagrant up          # 起動
vagrant halt        # 停止
vagrant reload      # 再起動（設定変更後）
vagrant ssh         # VM に入る
vagrant status      # VM 状態確認

# スナップショット
vagrant snapshot save "v1.1-stable"     # 保存
vagrant snapshot restore "v1.1-stable"  # 復元
vagrant snapshot list                   # 一覧
```

### デプロイ

```bash
# prod にデプロイ（VM内で実行）
/technomart/infrastructure/scripts/deploy.sh

# dev Namespace にデプロイ
/technomart/infrastructure/scripts/deploy.sh --env dev
```

### 状態確認

```bash
# Pod 一覧（ホスト側から）
vagrant ssh -c "kubectl get pods -n technomart"

# デプロイ記録
versions/status.sh
versions/status.sh --history
```

### toolbox でサービス疎通確認

```bash
vagrant ssh -c "kubectl exec -it toolbox -n technomart -- bash"
# コンテナ内:
psql -c "SELECT count(*) FROM users;"
redis-cli -h redis.technomart.svc.cluster.local ping
kcat -b kafka.technomart.svc.cluster.local:9092 -L
curl -s http://backend.technomart.svc.cluster.local:8000/healthz
awslocal s3 ls
```

---

## 現在の構成（v1.1）

```
ホスト (Windows 11)
  └─ VirtualBox VM: 192.168.56.10 (Ubuntu 24.04 / 10コア / 48GB)
        └─ k3s (k8s)
              ├─ namespace: technomart  (prod)
              │     ├─ backend (FastAPI / NodePort 30800)
              │     ├─ frontend (Next.js / NodePort 30300)
              │     ├─ postgresql (NodePort 32432)
              │     ├─ clickhouse (NodePort 30823/30900)
              │     ├─ redis (NodePort 32379)
              │     ├─ kafka (NodePort 32092)
              │     ├─ localstack (NodePort 31566)
              │     ├─ ollama (NodePort 31434)
              │     ├─ registry (NodePort 32500)
              │     ├─ toolbox
              │     └─ fluent-bit (DaemonSet)
              └─ namespace: technomart-dev (dev / 空)
```

---

## アクセス先一覧

| サービス | URL / 接続先 |
|---|---|
| フロントエンド | http://192.168.56.10:30300 |
| バックエンド API | http://192.168.56.10:30800 |
| Swagger UI | http://192.168.56.10:30800/docs |
| PostgreSQL | 192.168.56.10:32432 |
| ClickHouse (HTTP) | http://192.168.56.10:30823 |
| Redis | 192.168.56.10:32379 |
| Kafka | 192.168.56.10:32092 |
| LocalStack S3 | http://192.168.56.10:31566 |
| Ollama | http://192.168.56.10:31434 |
| ローカルレジストリ | http://192.168.56.10:32500 |
