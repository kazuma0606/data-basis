# v1.1.2 タスクリスト — ビルドプロセス改善・デプロイ自動化

作成日: 2026-03-17
参照: v1.1.2/plan.md

進捗凡例: `[ ]` 未着手 / `[>]` 作業中 / `[x]` 完了 / `[-]` スキップ

---

## フェーズ0: 現状確認

- [ ] **0-1. ビルドコンテキストサイズを確認**
  ```bash
  # .dockerignore なし → 808MB が記録済み
  # backend 側も同様に確認
  du -sh /technomart/application/backend/
  du -sh /technomart/application/frontend/
  ```

- [ ] **0-2. 現在のディスク使用量を記録**
  ```bash
  vagrant ssh -c "df -h / && docker system df"
  ```

- [ ] **0-3. backend に .dockerignore が存在するか確認**
  ```bash
  ls /technomart/application/backend/.dockerignore 2>/dev/null || echo 'NOT FOUND'
  ```

---

## フェーズ1: .dockerignore 追加

- [ ] **1-1. `application/frontend/.dockerignore` を作成**
  除外対象:
  - `node_modules/` — Docker 内で `npm ci` するため不要
  - `.next/` — Docker 内でビルドするため不要
  - `.git/` — 巨大かつビルド不要
  - `.env.local`, `*.md` 等

- [ ] **1-2. `application/backend/.dockerignore` を作成**
  除外対象:
  - `__pycache__/`, `*.pyc`
  - `.venv/`, `venv/`
  - `.git/`
  - `*.md`, `.env*`

### 🧪 テスト1: ビルドコンテキスト縮小確認
```bash
# frontend ビルド時の "Sending build context" サイズを確認
vagrant ssh -c "
  docker build --no-cache -t test-context /technomart/application/frontend 2>&1 \
    | grep 'Sending build context'
"
# 期待: Sending build context to Docker daemon  X.XMB（5MB 以下）
```
- [ ] ビルドコンテキストが 10MB 以下になること
- [ ] `npm ci` がキャッシュを使って高速化されること

---

## フェーズ2: BuildKit 有効化

- [ ] **2-1. Docker デーモンに BuildKit をデフォルト有効化**
  ```bash
  # /etc/docker/daemon.json に追記
  vagrant ssh -c "
    sudo cat /etc/docker/daemon.json
  "
  # {"features": {"buildkit": true}} を追加
  ```

- [ ] **2-2. daemon.json を更新して Docker を再起動**
  ```bash
  vagrant ssh -c "
    echo '{\"features\":{\"buildkit\":true},\"insecure-registries\":[\"192.168.56.10:32500\"]}' \
      | sudo tee /etc/docker/daemon.json
    sudo systemctl restart docker
    docker info | grep BuildKit
  "
  ```
  - 注意: Docker 再起動中は build/push が一時停止

### 🧪 テスト2: BuildKit 動作確認
```bash
vagrant ssh -c "docker info | grep -i buildkit"
# 期待: buildkit: true
```
- [ ] BuildKit がデフォルト有効になっていること

---

## フェーズ3: 統合デプロイスクリプト作成

- [ ] **3-1. `infrastructure/scripts/deploy.sh` を作成**

  スクリプトの仕様:
  - 引数: `<service>` (frontend | backend) + `[message]`
  - REGISTRY, SEMVER, GIT_HASH を自動取得
  - ビルド前に `docker image prune -f`
  - `DOCKER_BUILDKIT=1 docker build`（BuildKit 有効化）
  - ビルド後に前世代イメージを削除（直前タグより古いものを `docker rmi`）
  - `kubectl set image` → `kubectl rollout status`
  - `versions/record.sh` でデプロイ記録
  - 完了後に `df -h /` と `docker system df` を表示

- [ ] **3-2. スクリプトに実行権限を付与**
  ```bash
  chmod +x /technomart/infrastructure/scripts/deploy.sh
  ```

### 🧪 テスト3: スクリプトによるデプロイ
```bash
# frontend をスクリプト1本でデプロイ
vagrant ssh -c "bash /technomart/infrastructure/scripts/deploy.sh frontend 'v1.1.2 build improvements'"
```
- [ ] ビルドコンテキストが小さいこと（ログで確認）
- [ ] BuildKit ヘッダーが出ること（`[+] Building ...` 形式）
- [ ] push が成功すること
- [ ] rollout が完了すること
- [ ] versions DB に記録されること
- [ ] ディスク使用量が前回より抑えられていること

---

## フェーズ4: 動作確認・スナップショット

- [ ] **4-1. 実際のビルド時間を計測・記録**
  ```bash
  time bash /technomart/infrastructure/scripts/deploy.sh frontend 'timing test'
  ```
  - 改善前: ~40分（808MB コンテキスト転送 + npm ci + next build）
  - 改善後の目標: ~10分（コンテキスト小 + BuildKit キャッシュ）

- [ ] **4-2. backend も同じスクリプトでデプロイできることを確認**
  ```bash
  bash /technomart/infrastructure/scripts/deploy.sh backend 'v1.1.2 build improvements'
  ```

- [ ] **4-3. ディスク状況の確認**
  ```bash
  vagrant ssh -c "df -h / && docker system df"
  # 目標: / の使用率が 70% 以下
  ```

- [ ] **4-4. `vagrant snapshot save "v1.1.2-stable"`**
  ```bash
  vagrant snapshot save "v1.1.2-stable"
  ```

### ✅ フェーズ4 完了基準
- [ ] ビルド時間が大幅短縮されること（コンテキスト転送が数秒以内）
- [ ] ディスク使用率が安定していること
- [ ] スナップショット保存完了

---

## 作業メモ欄

### フェーズ0
- 実施日:
- frontend ビルドコンテキスト改善前のサイズ: 808.2MB（v1.1.1 ビルド時に確認済み）
- backend ビルドコンテキストサイズ:

### フェーズ1
- 実施日:
- 改善後のコンテキストサイズ（frontend）:
- 改善後のコンテキストサイズ（backend）:

### フェーズ2
- 実施日:
- BuildKit 有効化前の docker info:
- BuildKit 有効化後:

### フェーズ3
- 実施日:
- deploy.sh のパス:
- イメージローテーション方針（何世代残すか）:

### フェーズ4
- 実施日:
- 改善前のビルド時間: ~40分
- 改善後のビルド時間:
- ディスク使用率（改善後）:

---

## ✅ v1.1.2 完了基準

| 確認項目 | 確認方法 |
|---|---|
| ビルドコンテキストが 10MB 以下 | ビルドログの `Sending build context` 行を確認 |
| BuildKit が有効 | `docker info \| grep BuildKit` |
| deploy.sh 1本でデプロイ完結 | `bash deploy.sh frontend 'test'` が正常終了 |
| ビルド後にディスクが自動整理される | `docker system df` で古いイメージがないこと |
| ディスク使用率が 70% 以下で安定 | `df -h /` |
| v1.1.2-stable スナップショット保存 | `vagrant snapshot list` |
