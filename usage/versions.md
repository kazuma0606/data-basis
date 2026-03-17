# バージョン管理・ロールバック

デプロイ履歴は `versions/deployments.db`（SQLite）に記録される。
ファイルはホスト側（Windows）に存在するため、VM がクラッシュしても記録が残る。

---

## ファイル構成

```
versions/
  deployments.db    # SQLite DB 本体（gitignore 対象）
  schema.sql        # テーブル定義（git 管理）
  record.sh         # deploy.sh から自動呼び出し（手動実行も可）
  status.sh         # 現在の状態確認
  rollback.sh       # ロールバック実行
```

---

## 現在のデプロイ状態を確認する

```bash
# ホスト側で実行（VM 不要）
versions/status.sh
```

出力例:
```
========================================
 現在のデプロイ状態
========================================
environment  service   semver  git_hash  deployed_at
-----------  --------  ------  --------  -------------------
prod         backend   v1.1    04b359d   2026-03-17 07:07:53
prod         frontend  v1.1    04b359d   2026-03-17 07:07:53
```

### 履歴を表示

```bash
versions/status.sh --history
# または
versions/status.sh -h
```

### 特定サービスだけ表示

```bash
versions/status.sh --service backend
versions/status.sh --history --service frontend
```

---

## デプロイを手動記録する

`deploy.sh` が自動的に呼び出すが、手動でも記録できる。

```bash
versions/record.sh <env> <service> <semver> <git_hash> <image_ref> [notes]

# 例
versions/record.sh prod backend v1.1 04b359d \
  192.168.56.10:32500/technomart-backend:v1.1-04b359d \
  "手動デプロイ"
```

---

## ロールバック

指定したサービスを直前の成功デプロイに戻す。

```bash
# ホスト側で実行（vagrant ssh を経由して VM に kubectl 実行）
versions/rollback.sh <env> <service>

# 例: prod の backend を1つ前に戻す
versions/rollback.sh prod backend
```

実行すると確認プロンプトが出る:

```
ロールバック: prod/backend → v1.0 (abc1234)
  image: 192.168.56.10:32500/technomart-backend:v1.0-abc1234
続行しますか？ [y/N]
```

`y` を入力するとロールバックが実行される。

---

## Vagrant スナップショットとの使い分け

| 手段 | 粒度 | 対象 | 用途 |
|---|---|---|---|
| `versions/rollback.sh` | サービス単位 | k8s Deployment のイメージ | 特定サービスだけ戻したい |
| `vagrant snapshot restore` | VM 全体 | すべてのデータ・k8s 状態 | クラスター全体がおかしい・緊急脱出 |

**基本方針**: まず `rollback.sh` を試す。クラスター全体が壊れた場合は `snapshot restore` で丸ごと戻す。

---

## 現在のスナップショット

```
v1.0-stable   # v1.0 完了時点（2026-03-17）
v1.1-stable   # v1.1 完了時点（2026-03-17）
```

復元コマンド:

```bash
cd infrastructure/vagrant/production
vagrant snapshot restore "v1.1-stable"
# 復元後に確認
vagrant ssh -c "kubectl get pods -n technomart"
```

---

## DB を直接参照する

SQLite なので `sqlite3` コマンドで直接クエリできる（ホスト側で実行可）:

```bash
# 全デプロイ履歴
sqlite3 -header -column versions/deployments.db \
  "SELECT * FROM deployments ORDER BY id DESC LIMIT 20;"

# 現在の状態
sqlite3 -header -column versions/deployments.db \
  "SELECT * FROM current_state;"

# ロールバック済みのデプロイを確認
sqlite3 versions/deployments.db \
  "SELECT * FROM deployments WHERE status = 'rolled_back';"
```

### スキーマ

```sql
-- 全デプロイ履歴（追記のみ）
CREATE TABLE deployments (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    deployed_at  TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
    environment  TEXT    NOT NULL,  -- 'prod' | 'dev'
    service      TEXT    NOT NULL,  -- 'backend' | 'frontend'
    semver       TEXT    NOT NULL,  -- 'v1.1'
    git_hash     TEXT    NOT NULL,  -- '04b359d'
    git_branch   TEXT,              -- 'main'
    image_ref    TEXT    NOT NULL,  -- '192.168.56.10:32500/...'
    status       TEXT    NOT NULL,  -- 'success' | 'failed' | 'rolled_back'
    notes        TEXT
);

-- 現在の状態（environment + service ごとに1件）
CREATE TABLE current_state (
    environment  TEXT    NOT NULL,
    service      TEXT    NOT NULL,
    semver       TEXT    NOT NULL,
    git_hash     TEXT    NOT NULL,
    image_ref    TEXT    NOT NULL,
    deployed_at  TEXT    NOT NULL,
    PRIMARY KEY (environment, service)
);
```

---

## バージョンの付け方

`VERSION` ファイルでセマンティックバージョンを管理する。

```bash
cat VERSION
# → v1.1
```

フェーズが進んだら手動で bump する:

```bash
echo "v1.2" > VERSION
git add VERSION && git commit -m "bump version to v1.2"
```

次のデプロイから新しいタグが付く:
```
192.168.56.10:32500/technomart-backend:v1.2-{新しいgit_hash}
```

---

## v1.1 時点のデプロイ記録

`v1.1/deployment_snapshot.txt` に保存済み:

```
========================================
 現在のデプロイ状態
========================================
environment  service   semver  git_hash  deployed_at
-----------  --------  ------  --------  -------------------
prod         backend   v1.1    04b359d   2026-03-17 07:07:53
prod         frontend  v1.1    04b359d   2026-03-17 07:07:53
```
