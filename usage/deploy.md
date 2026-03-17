# デプロイ手順

---

## 概要

デプロイは VM 内の `deploy.sh` が一括管理する。
ホスト側で行う作業は `vagrant ssh` でログインするだけ。

```
ホスト（コード編集）
  → vagrant ssh
    → deploy.sh （VM内で実行）
      → docker build
      → docker push → ローカルレジストリ (192.168.56.10:32500)
      → kubectl apply / kubectl set image
      → versions/record.sh → deployments.db
```

---

## 通常のデプロイ（prod）

```bash
# 1. VM にログイン
vagrant ssh

# 2. デプロイ実行（prod がデフォルト）
/technomart/infrastructure/scripts/deploy.sh
```

スクリプトが以下を順番に実行する:

| ステップ | 内容 |
|---|---|
| [0/8] | Namespace 確認・作成 |
| [1/8] | Kafka (KRaft) |
| [2/8] | Redis |
| [3/8] | PostgreSQL + pgvector |
| [4/8] | ClickHouse |
| [5/8] | LocalStack (S3バケット作成含む) |
| [6/8] | Ollama (初回はモデル pull で数〜十数分) |
| [7/8] | Backend (FastAPI) — docker build + push |
| [8/8] | Frontend (Next.js) — docker build + push |

完了後に全 Pod 状態とデプロイ記録が表示される。

---

## dev Namespace へのデプロイ

```bash
/technomart/infrastructure/scripts/deploy.sh --env dev
# または
DEPLOY_ENV=dev /technomart/infrastructure/scripts/deploy.sh
```

- Namespace が `technomart-dev` に切り替わる
- イメージタグは同じ形式 (`v1.1-{git_hash}`)
- デプロイ記録は `dev/backend`・`dev/frontend` として DB に保存される

---

## イメージタグの仕組み

デプロイごとにイメージに2種類のタグが付く:

```
192.168.56.10:32500/technomart-backend:v1.1-04b359d   ← バージョン付き (固定)
192.168.56.10:32500/technomart-backend:latest          ← 最新を常に指す
```

タグの構成:

```
{semver} - {git_short_hash}
  ↑              ↑
VERSION ファイル  git rev-parse --short HEAD
```

`VERSION` ファイルを変更すれば次のデプロイから新しい semver になる:

```bash
echo "v1.2" > VERSION
git add VERSION && git commit -m "bump version to v1.2"
```

---

## 初期データ投入

全サービスのデプロイが完了した後、初回のみ実行する。

```bash
# VM内で実行（デフォルト 5000人分）
/technomart/infrastructure/scripts/initial_data.sh

# 人数を指定する場合
/technomart/infrastructure/scripts/initial_data.sh 10000
```

処理内容:

| ステップ | 内容 |
|---|---|
| [0/5] | Python venv セットアップ |
| [1/5] | Synthetic Data 生成（CSV） |
| [2/5] | PostgreSQL へロード |
| [3/5] | ClickHouse へロード |
| [4/5] | Kafka へプロデュース |
| [5/5] | LocalStack S3 へアップロード |

---

## 特定サービスだけ再デプロイ

アプリコードを変更して backend だけ更新したい場合などは、
`deploy.sh` 全体を実行せず手動でビルド・push・rollout する。

```bash
# VM内で実行
REGISTRY="192.168.56.10:32500"
SEMVER=$(cat /technomart/VERSION | tr -d '[:space:]')
GIT_HASH=$(git -C /technomart rev-parse --short HEAD)
TAG="${SEMVER}-${GIT_HASH}"

# backend だけ
docker build -t "${REGISTRY}/technomart-backend:${TAG}" \
             -t "${REGISTRY}/technomart-backend:latest" \
             /technomart/application/backend
docker push "${REGISTRY}/technomart-backend:${TAG}"
docker push "${REGISTRY}/technomart-backend:latest"

kubectl set image deployment/backend \
  backend="${REGISTRY}/technomart-backend:${TAG}" \
  -n technomart
kubectl rollout status deployment/backend -n technomart --timeout=3m

# デプロイ記録
bash /technomart/versions/record.sh prod backend "$SEMVER" "$GIT_HASH" \
  "${REGISTRY}/technomart-backend:${TAG}"
```

---

## 削除・クリーンアップ

### Namespace だけ削除して再デプロイ

```bash
# VM内で実行（対話的に確認あり）
/technomart/infrastructure/scripts/teardown.sh

# 削除後に再デプロイ
/technomart/infrastructure/scripts/deploy.sh
```

> teardown.sh は PVC（永続データ）も削除する。
> データを残したい場合は個別のリソースを手動削除する。

### Docker イメージの整理

```bash
# 使用中のイメージを除いてすべて削除
docker image prune -a

# レジストリのカタログ確認
curl -s http://192.168.56.10:32500/v2/_catalog
```

---

## Vagrantfile マウント構成

ホスト側のリポジトリは VM 内に2箇所マウントされている:

| ホスト | VM 内 | 用途 |
|---|---|---|
| `infrastructure/vagrant/production/` | `/vagrant/` | Vagrantfile と provision スクリプト |
| リポジトリルート (`data-basis/`) | `/technomart/` | アプリ・マニフェスト全体 |

ホスト側でコードを編集すると `/technomart/` に即時反映される。
`docker build` のコンテキストは `/technomart/application/backend` など VM 内パスで指定する。

---

## トラブルシューティング

### `docker build` が遅い

初回ビルドはベースイメージのダウンロードで5〜15分かかる。
2回目以降はレイヤーキャッシュが効くため数秒〜1分。

キャッシュが効いているかの確認:

```bash
# ビルドログに "Using cache" が出ていればキャッシュ有効
docker build ... 2>&1 | grep "Using cache"
```

### `rollout status` がタイムアウト

```bash
kubectl describe pod -l app=backend -n technomart
kubectl logs -l app=backend -n technomart --previous
```

よくある原因:
- DB 起動待ち → readinessProbe が通るまで数十秒かかる
- イメージ pull 失敗 → レジストリの状態を確認

### Ollama モデル pull が中断された

```bash
# VM内で再実行
OLLAMA_POD=$(kubectl get pod -n technomart -l app=ollama -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n technomart "$OLLAMA_POD" -- ollama pull qwen2.5:3b
kubectl exec -n technomart "$OLLAMA_POD" -- ollama pull nomic-embed-text
```
