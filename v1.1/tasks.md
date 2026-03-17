# v1.1 タスクリスト — 運用安定化

作成日: 2026-03-17
参照: v1.1/plan.md

進捗凡例: `[ ]` 未着手 / `[>]` 作業中 / `[x]` 完了 / `[-]` スキップ

---

## フェーズ0: 現状保全（最優先）

> v1.0 の安定状態を保護する。これ以降の作業で何か壊れても必ず戻れるようにする。
> **このフェーズを完了するまで他の作業を始めない。**

- [x] **0-1. v1.0 の動作確認**
  - [x] `kubectl get pods -n technomart` — 全Pod が Running であること
  - [x] http://192.168.56.10:30300 にブラウザでアクセスできること（307リダイレクト確認）
  - [x] http://192.168.56.10:30800/docs にアクセスできること（200 OK確認）
  - [x] PostgreSQL: users 3件確認 / Redis: PONG / ClickHouse: SELECT 1 正常
  - 備考: VMがguru meditation状態で起動していたため、Unknown Podを強制削除して復旧してから確認

- [x] **0-2. Vagrant スナップショット保存**
  ```bash
  cd infrastructure/vagrant/production
  vagrant snapshot save "v1.0-stable"
  vagrant snapshot list   # 保存されていることを確認
  ```
  - 実施日: 2026-03-17
  - 結果: "v1.0-stable" 保存済み確認

- [ ] **0-3. スナップショット復元テスト**（任意だが推奨）
  ```bash
  vagrant snapshot restore "v1.0-stable"
  # 復元後に 0-1 の動作確認を再実施
  ```

### ✅ フェーズ0 完了基準
- [x] Vagrant スナップショット "v1.0-stable" が存在する
- [ ] 復元しても全サービスが正常に動くことを確認済み（0-3 を実施する場合）

---

## フェーズ1: ローカルレジストリ構築

> `docker save | import` を廃止し、`docker push` ベースのビルドフローに切り替える。

- [x] **1-1. registry:2 マニフェスト作成**
  - `infrastructure/k8s/registry/manifest.yaml` を作成
  - Deployment + Service（NodePort :32500）

- [x] **1-2. レジストリを k3s にデプロイ**
  - 実施日: 2026-03-17
  - 結果: deployment/registry Running 確認

- [x] **1-3. k3s insecure registry 設定**
  - `/etc/rancher/k3s/registries.yaml` 作成済み
  - k3s 再起動後も全Pod Running 確認
  - VM 内 Docker の `/etc/docker/daemon.json` にも insecure-registries 追加済み

### 🧪 テスト1: レジストリ疎通確認
- [x] VM 内から push / pull 成功確認（hello-world で検証）
- [x] `curl http://192.168.56.10:32500/v2/_catalog` でカタログ確認
- 備考: ホスト側 Docker Desktop（WSL2）は daemon.json 反映に GUI 再起動が必要。
        deploy.sh は VM 内実行のため、VM 側設定のみで問題なし。
**結果**: ✅ 合格

---

## フェーズ2: k3s 自動起動設定

- [x] **2-1. systemd サービスの有効化**
  - 実施日: 2026-03-17
  - 結果: すでに `enabled` 状態だった（k3s インストール時に自動設定済み）

- [x] **2-2. VM 再起動テスト（軽量版）**
  - `sudo systemctl restart k3s` で確認（フル再起動はフェーズ7で実施）
  - 再起動後も全 Pod Running 確認

### 🧪 テスト2: 再起動後の k3s 起動確認
- [x] k3s が `enabled` であること確認
- [x] systemctl restart 後も全 Pod Running 確認
- 備考: `imagePullPolicy: Never` のままのため、VM フル再起動での Pod 自動復旧はフェーズ3完了後に確認。
**結果**: ✅ 合格

---

## フェーズ3: イメージバージョンタグ化 + deploy.sh 改訂

- [ ] **3-1. VERSION ファイルをルートに作成**
  ```
  v1.1
  ```

- [ ] **3-2. versions/ ディレクトリの初期化**
  ```bash
  sqlite3 versions/deployments.db < versions/schema.sql
  # テーブルが作成されたか確認
  sqlite3 versions/deployments.db ".tables"
  ```

- [ ] **3-3. 全マニフェストの image URL 変更**
  - `localhost:5000/` → `192.168.56.10:32500/` に変更
    （VM 内から push・pull するため localhost ではなく NodePort アドレスを使う）
  - `imagePullPolicy: Never` → `imagePullPolicy: Always` に変更
  - 対象: backend / frontend / toolbox（フェーズ4で作成）

- [ ] **3-4. deploy.sh 全面改訂**
  - `docker save | sudo k3s ctr images import -` を削除
  - `docker build → docker tag → docker push` に変更
  - バージョンタグ（`${SEMVER}-${GIT_HASH}`）を付与
  - `versions/record.sh` の呼び出しを追加

- [ ] **3-5. 改訂した deploy.sh でフルデプロイ実行**
  ```bash
  DEPLOY_ENV=prod bash infrastructure/scripts/deploy.sh
  ```

### 🧪 テスト3: ビルドフロー + バージョン記録確認
```bash
# イメージにバージョンタグが付いているか
docker images | grep technomart

# デプロイ記録が DB に入っているか
versions/status.sh

# Pod が新しいイメージで動いているか
kubectl get pods -n technomart -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.containers[0].image}{"\n"}{end}'
```
**期待結果**:
- イメージに `v1.1-xxxxxxx` 形式のタグが付いている
- `versions/status.sh` に prod 環境の全サービスが表示される
- Pod の image 欄にバージョンタグ付きの image ref が表示される

### 🧪 テスト3b: 2回目ビルドの速度確認
```bash
# ソースを1行変更してから再デプロイ
time bash infrastructure/scripts/deploy.sh   # 時間を計測
```
**期待結果**: 初回より明らかに速い（差分レイヤーのみ転送）

---

## フェーズ4: dev Namespace 分離

- [ ] **4-1. technomart-dev Namespace 作成**
  ```bash
  kubectl create namespace technomart-dev
  kubectl get ns
  ```

- [ ] **4-2. deploy.sh に `--env` オプション追加**
  - `DEPLOY_ENV=dev` で `technomart-dev` Namespace に向けてデプロイできること

- [ ] **4-3. dev 環境へのデプロイテスト**
  ```bash
  DEPLOY_ENV=dev bash infrastructure/scripts/deploy.sh
  versions/status.sh
  ```

### 🧪 テスト4: dev/prod 分離確認
```bash
kubectl get pods -n technomart      # prod
kubectl get pods -n technomart-dev  # dev
versions/status.sh                  # 両環境がDBに記録されている
```
**期待結果**: prod と dev で別々の Pod が動いており、DB にも両環境の記録がある

---

## フェーズ5: toolbox コンテナ

- [ ] **5-1. Dockerfile 作成**
  - `infrastructure/k8s/toolbox/Dockerfile` を plan.md の内容で作成

- [ ] **5-2. toolbox イメージをビルド・push**
  ```bash
  docker build -t 192.168.56.10:32500/technomart-toolbox:v1.1 \
    infrastructure/k8s/toolbox/
  docker push 192.168.56.10:32500/technomart-toolbox:v1.1
  ```

- [ ] **5-3. toolbox マニフェスト作成・デプロイ**
  - `infrastructure/k8s/toolbox/manifest.yaml` を作成
  ```bash
  kubectl apply -f infrastructure/k8s/toolbox/manifest.yaml
  kubectl wait --for=condition=Ready pod/toolbox -n technomart --timeout=2m
  ```

### 🧪 テスト5: toolbox から全サービスへの疎通確認
```bash
kubectl exec -it toolbox -n technomart -- bash
```
コンテナ内で以下を順番に確認:
```bash
# PostgreSQL
psql -c "SELECT count(*) FROM users;"

# Redis
redis-cli -h redis.technomart.svc.cluster.local ping
# → PONG

# Kafka
kcat -b kafka.technomart.svc.cluster.local:9092 -L
# → トピック一覧が表示される

# Backend API
curl -s http://backend.technomart.svc.cluster.local:8000/health
# → {"status":"ok"} 相当のレスポンス

# LocalStack S3
awslocal s3 ls
# → technomart-datalake が表示される

# DNS 解決
dig postgresql.technomart.svc.cluster.local +short
# → ClusterIP が返る
```
**期待結果**: 全サービスに接続できる

---

## フェーズ6: Fluent Bit（ログ蓄積）

- [ ] **6-1. Fluent Bit マニフェスト作成**
  - `infrastructure/k8s/fluent-bit/manifest.yaml` を作成
  - DaemonSet + ConfigMap（plan.md の設定を使用）

- [ ] **6-2. デプロイ**
  ```bash
  kubectl apply -f infrastructure/k8s/fluent-bit/manifest.yaml
  kubectl get pods -n technomart -l app=fluent-bit
  ```

- [ ] **6-3. Fluent Bit ログの確認**
  ```bash
  kubectl logs -l app=fluent-bit -n technomart --tail=20
  ```
  エラーが出ていないこと

### 🧪 テスト6: ログが S3 に届くか
```bash
# toolbox から確認
kubectl exec -it toolbox -n technomart -- bash
awslocal s3 ls s3://technomart-datalake/logs/
# → 日付ディレクトリが存在する

# ログファイルの中身を確認
awslocal s3 cp s3://technomart-datalake/logs/$(date +%Y/%m/%d)/$(ls ...) - | head -20
```
**期待結果**: S3 にログファイルが蓄積されている

### 🧪 テスト6b: クラッシュログの永続化確認
```bash
# 意図的に Pod を強制削除してログが残るか確認
kubectl delete pod -l app=backend -n technomart
# 少し待って Pod が再起動してから
awslocal s3 ls s3://technomart-datalake/logs/
```
**期待結果**: 削除前のログが S3 に残っている

---

## フェーズ7: VM 再起動 + 全体最終確認

- [ ] **7-1. VM をシャットダウンして再起動**
  ```bash
  cd infrastructure/vagrant/production
  vagrant reload
  ```

- [ ] **7-2. 再起動後の全サービス確認**
  ```bash
  vagrant ssh -c "kubectl get pods -n technomart"
  vagrant ssh -c "kubectl get pods -n technomart-dev"
  ```

### 🧪 テスト7: 再起動後の完全復旧確認
以下をすべてチェック:
```
[ ] k3s が自動起動している（systemctl status k3s）
[ ] technomart namespace の全 Pod が Running
[ ] ローカルレジストリ Pod が Running
[ ] toolbox Pod が Running
[ ] http://192.168.56.10:30300 にアクセスできる
[ ] ログインが成功する
[ ] versions/status.sh に記録が残っている（DB は VM 外のホスト側にある）
```
**期待結果**: 手動操作なしで全サービスが復旧する

---

## フェーズ8: v1.1 完了スナップショット保存

- [ ] **8-1. v1.1 完了時点のスナップショット保存**
  ```bash
  cd infrastructure/vagrant/production
  vagrant snapshot save "v1.1-stable"
  vagrant snapshot list
  ```

- [ ] **8-2. ロールバック手順の動作確認**（任意だが推奨）
  ```bash
  # v1.0 に戻せるか確認
  vagrant snapshot restore "v1.0-stable"
  # 動作確認後、v1.1 に戻す
  vagrant snapshot restore "v1.1-stable"
  ```

- [ ] **8-3. versions/status.sh の最終出力を記録**
  ```bash
  versions/status.sh > v1.1/deployment_snapshot.txt
  ```

### ✅ v1.1 完了基準

| 確認項目 | 確認方法 |
|---|---|
| ビルドが push ベースになっている | `deploy.sh` に `docker save` が存在しない |
| イメージにバージョンタグが付いている | `docker images \| grep technomart` |
| デプロイ記録が DB に残っている | `versions/status.sh` |
| VM 再起動後に全 Pod が自動復旧する | `vagrant reload` → `kubectl get pods` |
| toolbox から全サービスに接続できる | 各 CLI ツールで疎通確認済み |
| ログが S3 に蓄積されている | `awslocal s3 ls s3://technomart-datalake/logs/` |
| dev/prod Namespace が分離されている | `kubectl get ns` |
| "v1.0-stable" スナップショットが存在する | `vagrant snapshot list` |
| "v1.1-stable" スナップショットが存在する | `vagrant snapshot list` |

---

## 作業メモ欄

<!-- 作業中に気づいたこと・詰まったポイントを随時記録 -->

### フェーズ0
- 実施日: 2026-03-17
- スナップショット保存確認: v1.0-stable 保存済み
- 備考: VM が guru meditation 状態で起動。Unknown Pod を強制削除して全サービス復旧後にスナップショット取得。

### フェーズ1
- 実施日: 2026-03-17
- 詰まったポイント: ホスト側 Docker Desktop（WSL2バックエンド）は daemon.json を自動反映しない。deploy.sh は VM 内実行なので VM 側 Docker の設定のみで対応。

### フェーズ2
- 実施日: 2026-03-17

### フェーズ3
- 実施日:
- 初回ビルド時間:
- 2回目ビルド時間（差分）:

### フェーズ4
- 実施日:

### フェーズ5
- 実施日:
- toolbox 疎通確認:

### フェーズ6
- 実施日:

### フェーズ7
- 実施日:
- 再起動後の復旧時間:

### フェーズ8
- 実施日:
- v1.1-stable スナップショット保存確認:
