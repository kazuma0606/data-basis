# /snapshot — Vagrant スナップショットの保存

VM のスナップショットを保存する。作業前の安全網として毎バージョン必須。

**スナップショット名:** $ARGUMENTS

## 手順

### 1. 引数の確認

`$ARGUMENTS` が空の場合はユーザーに名前を確認する（例: `pre-v1.4`, `v1.4-stable`）。

### 2. 現在のスナップショット一覧を確認

作業ディレクトリ `C:\Users\yoshi\data-basis\infrastructure\vagrant\production` で実行：

```bash
vagrant snapshot list
```

同名のスナップショットが既に存在する場合はユーザーに確認してから上書きする。

### 3. スナップショットを保存

```bash
vagrant snapshot save "<スナップショット名>"
```

完了メッセージ `Snapshot saved!` が出ることを確認する。

### 4. 保存後の一覧を表示

```bash
vagrant snapshot list
```

### 5. 結果報告

```
✅ スナップショット保存完了
  名前: <スナップショット名>
  保存日時: <現在日時>

現在のスナップショット一覧:
  - pre-v1.3
  - v1.3-stable
  - v1.3-stable-clickhouse
  - <スナップショット名>  ← 今回
```

## 命名規則（参考）

| タイミング | 推奨名 |
|---|---|
| バージョン作業開始前 | `pre-v<バージョン>` |
| バージョン完了後（安定版） | `v<バージョン>-stable` |
| 重要な中間マイルストーン | `v<バージョン>-<機能名>` |
