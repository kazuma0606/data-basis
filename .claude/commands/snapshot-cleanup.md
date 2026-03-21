# /snapshot-cleanup — 古いスナップショットの整理

最新の stable スナップショット以外を削除し、ホストのディスク容量を回収する。
バージョン完了後に定期実行する。

## 手順

作業ディレクトリ: `C:\Users\yoshi\data-basis\infrastructure\vagrant\production`

### 1. 現在のスナップショット一覧を確認

```bash
vagrant snapshot list
```

一覧を表示してユーザーに確認を求める。

### 2. 削除対象の特定

以下のパターンに該当するものを削除対象とする：
- `pre-v*`（作業前バックアップ）
- 最新以外の `*-stable`（古い安定版）

**残すもの**: 最新の `*-stable` スナップショット1つのみ

### 3. ユーザーに確認

削除対象リストを提示して確認を取る：

```
以下のスナップショットを削除します（残す: <最新stable名>）：
  - pre-v1.x
  - v1.x-stable
  ...
よろしいですか？
```

### 4. 削除実行

確認が取れたら順番に削除する（VirtualBox が差分をマージするため1つずつ実行）：

```bash
vagrant snapshot delete "<スナップショット名>"
```

各削除後に完了メッセージを確認する。

### 5. 削除後の確認

```bash
vagrant snapshot list
```

最新 stable のみ残っていることを確認する。

### 6. ホスト側の容量確認

```bash
du -sh "/c/Users/yoshi/VirtualBox VMs/technomart-ubuntu/Snapshots/"
du -sh "/c/Users/yoshi/VirtualBox VMs/technomart-ubuntu/"
```

### 7. 結果報告

```
✅ スナップショット整理完了

削除したスナップショット: <N>個
残したスナップショット: <最新stable名>

ホストディスク使用量:
  Snapshots: <サイズ>
  VM全体:    <サイズ>
```

## 注意事項

- スナップショットは差分ディスクの連鎖のため、削除時に VirtualBox が自動マージする
- マージに時間がかかる場合があるため、1つずつ順番に削除する
- 削除したスナップショットは復元不可（必要なら事前に OVA エクスポート）
- VM が起動中でも削除可能だが、I/O 負荷が上がるため注意
