# v1.1.2 アップデート計画 — ビルドプロセス改善・デプロイ自動化

作成日: 2026-03-17
前提: v1.1.1 完了後（Pod 状態可視化・SSE ストリーミング実装済み）

---

## 目的

v1.1.1 のデプロイ中に以下の問題が顕在化した:

1. **Docker ビルドが重い** — `.dockerignore` が存在しないため `node_modules`（500MB超）を含む 808MB のコンテキストを毎回 Docker daemon に送信していた
2. **イメージが溜まりディスク圧迫** — 古いビルド中間イメージが残り続け、DiskPressure → Pod evict が発生
3. **デプロイ手順が長く手動** — ビルド→タグ付け→プッシュ→apply→記録 を毎回手作業

v1.1.2 ではこれらを解消し、**安全で素早いデプロイフロー**を確立する。

---

## 改善内容

### 1. `.dockerignore` を追加（最大効果・即効）

`.dockerignore` がないと Dockerfile の `COPY . .` 前にホスト側のすべてのファイルが Docker daemon に転送される。

```
Before: Sending build context to Docker daemon  808.2MB
After:  Sending build context to Docker daemon  ~5MB   （node_modules / .next を除外）
```

対象ファイル:
- `application/frontend/.dockerignore`
- `application/backend/.dockerignore`

除外対象:
- `node_modules/` — Docker 内で `npm ci` / `pip install` するため不要
- `.next/` — Docker 内で `npm run build` するため不要
- `.git/` — ビルドに不要、かつ巨大になり得る
- `*.md`, `.env.local` 等

### 2. BuildKit を有効化

レガシービルダーは非推奨。BuildKit に切り替えることで:
- ビルドステージの並列実行
- より精度の高いレイヤーキャッシュ
- `--mount=type=cache` によるキャッシュマウント（npm/pip のキャッシュ保持）

```bash
DOCKER_BUILDKIT=1 docker build ...
```

k3s 環境では `dockerd` の設定か、ビルド時の環境変数で有効化する。

### 3. デプロイスクリプトにイメージローテーションを組み込む

ビルドのたびに古いイメージを自動削除し、ディスクを圧迫しないようにする。

方針:
- レジストリには **最新2世代**（latest + 直前タグ）のみ残す
- ローカル Docker イメージは **`docker image prune`** でビルドキャッシュを管理
- `docker system df` でビルド前後のディスク使用量を表示

### 4. 統合デプロイスクリプト `scripts/deploy.sh` を作成

手順を1コマンドで完結させる:

```
Usage: deploy.sh <service> [message]
  service: frontend | backend
  message: デプロイメッセージ（省略可）

Example:
  bash /technomart/scripts/deploy.sh frontend 'v1.1.2 build improvements'
```

処理フロー:
```
1. VERSION / GIT_HASH からタグを決定
2. docker image prune -f（ビルド前のキャッシュ整理）
3. DOCKER_BUILDKIT=1 docker build（ビルド）
4. docker push（プッシュ）
5. 古いイメージのローカル削除（直前世代より前を削除）
6. kubectl set image（デプロイ）
7. kubectl rollout status（完了待ち）
8. versions/record.sh（記録）
9. df -h /（ディスク残量表示）
```

---

## 技術的な背景

### なぜ BuildKit か

レガシービルダー（`docker build` のデフォルト）は:
- ステージを逐次実行（deps → builder → runner）
- キャッシュのヒット率が低い

BuildKit は:
- マルチステージを並列実行
- `--mount=type=cache,target=/root/.npm` でキャッシュをビルド間で再利用
- ホスト側から Docker daemon への転送を差分のみに最適化

### ディスク管理の考え方

| タイミング | アクション |
|---|---|
| ビルド前 | `docker image prune -f`（ダングリングイメージ削除） |
| ビルド後 | 前世代タグのイメージを削除（`docker rmi` で明示的に） |
| 週次 or 手動 | `docker system prune -f`（全未使用リソース削除） |

レジストリ側は現状 garbage collection 未設定（LocalStack S3 ではなく自前 registry Pod）なので、
ローカル側の削除でディスク管理を行う。

---

## 変更ファイル一覧

```
application/frontend/
  .dockerignore                 # 新規作成（808MB → ~5MB）
application/backend/
  .dockerignore                 # 新規作成
infrastructure/scripts/
  deploy.sh                     # 新規作成（統合デプロイスクリプト）
```

---

## CI/CD の方向性（v1.2 以降への布石）

今回は「スクリプト1本で完結」に留める。
本格的な CI/CD は次のどちらかを検討:

| 選択肢 | メリット | デメリット |
|---|---|---|
| **Gitea + Gitea Actions** | GitHub Actions 互換、VM 内完結、軽量 | VM リソースを消費（RAM ~500MB） |
| **GitHub Actions self-hosted** | 外部 Git と統合済み | インターネット接続が前提 |
| **Makefile + SSH** | 依存ゼロ、シンプル | ホスト側 SSH が必要 |

現状はオフライン想定の VM 構成なので、**Makefile + deploy.sh** が最もミニマルで確実。
v1.2 以降でリソースに余裕が出たら Gitea を検討する。

---

## バージョン体系

```
v1.1    運用安定化（レジストリ / toolbox / Fluent Bit）← 完了
v1.1.1  Pod 状態可視化（SSE / /status ページ）← 完了
v1.1.2  ビルドプロセス改善・デプロイ自動化  ← ここ
v1.2    データフロー実装（Kafka / 名寄せ / スコアリング）
```
