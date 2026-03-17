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

- [x] **3-1. VERSION ファイルをルートに作成**
  - 実施日: 2026-03-17 / 内容: `v1.1`

- [x] **3-2. versions/ ディレクトリの初期化**
  - VM 内で `sqlite3` をインストールして初期化
  - テーブル確認: deployments / current_state / v_current / v_history

- [x] **3-3. 全マニフェストの image URL 変更**
  - backend / frontend: `technomart-xxx:latest` → `192.168.56.10:32500/technomart-xxx:latest`
  - `imagePullPolicy: Never` → `imagePullPolicy: Always`

- [x] **3-4. deploy.sh 全面改訂**
  - `docker save | sudo k3s ctr images import -` を削除
  - `docker build → docker push` + バージョンタグ付与に変更
  - `--env dev` オプション追加（Namespace切替）
  - `versions/record.sh` 呼び出しを追加

- [x] **3-5. 既存イメージをレジストリに登録**
  - k3s containerd から tar export → Docker load → push の手順で移行
  - backend / frontend ともに `v1.1-04b359d` タグで push 済み
  - DB に prod 環境の記録が入ることを確認

### 🧪 テスト3: ビルドフロー + バージョン記録確認
- [x] イメージに `v1.1-04b359d` タグが付いている
- [x] `versions/status.sh` で prod/backend・prod/frontend の記録を確認
- [x] Pod の image が `192.168.56.10:32500/technomart-backend:v1.1-04b359d` になっている
- [x] `deploy.sh` に `docker save` が存在しないことを確認
- [x] フロントエンド(307) / バックエンド /docs(200) 疎通確認
**結果**: ✅ 合格

### 🧪 テスト3b: 2回目ビルドの速度確認
- [ ] 次回 deploy.sh 実行時に計測する（フェーズ7のフルデプロイ時）

---

## フェーズ4: dev Namespace 分離

- [x] **4-1. technomart-dev Namespace 作成**
  - 実施日: 2026-03-17
  - 結果: technomart-dev Active 確認

- [x] **4-2. deploy.sh に `--env` オプション追加**
  - `--env dev` または `DEPLOY_ENV=dev` で technomart-dev Namespace に向けてデプロイ可能

- [ ] **4-3. dev 環境へのデプロイテスト**
  - フェーズ7のフルデプロイ時に合わせて実施

### 🧪 テスト4: dev/prod 分離確認
- [x] technomart / technomart-dev Namespace が両方 Active
- [x] versions/status.sh で prod 環境の記録が表示される
- [ ] dev 環境への実デプロイはフェーズ7で確認
**結果**: ✅ Namespace 分離は完了

---

## フェーズ5: toolbox コンテナ

- [x] **5-1. Dockerfile 作成**
  - `infrastructure/k8s/toolbox/Dockerfile` を plan.md の内容で作成
  - ClickHouse client は依存パッケージ未解決でスキップ（他ツールは全て正常インストール）

- [x] **5-2. toolbox イメージをビルド・push**
  - VM内でビルド（`~/toolbox/` にファイルをSCP転送して実行）
  - `192.168.56.10:32500/technomart-toolbox:v1.1` / `latest` タグで push 済み
  - AWS認証情報（`AWS_ACCESS_KEY_ID=test` 等）をmanifest ENV に追加

- [x] **5-3. toolbox マニフェスト作成・デプロイ**
  - `infrastructure/k8s/toolbox/manifest.yaml` を作成・デプロイ
  - toolbox Pod Running 確認

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

- [x] PostgreSQL: users 3件 (`count = 3`)
- [x] Redis: PONG
- [x] Kafka: 5トピック確認 (app.behaviors / inventory.updates / ec.events / pos.transactions / customer.scores)
- [x] Backend API: `{"status":"ok"}`
- [x] LocalStack S3: 疎通確認（exit 0）。バケット未作成はLocalStack再起動によるステートリセットのため（データ初期化で解決）
- [x] DNS: ClusterIP `10.43.195.168` 返却確認
**結果**: ✅ 合格（ClickHouse CLI のみ未インストール、他は全疎通）

---

## フェーズ6: Fluent Bit（ログ蓄積）

- [x] **6-1. Fluent Bit マニフェスト作成**
  - `infrastructure/k8s/fluent-bit/manifest.yaml` を作成
  - DaemonSet + ConfigMap + ServiceAccount + ClusterRole

- [x] **6-2. デプロイ**
  - 実施日: 2026-03-17
  - fluent-bit-nwtk7 Running 確認

- [x] **6-3. Fluent Bit ログの確認**
  - inotify で全 Pod のログファイルを監視中（24ファイル）
  - `Successfully uploaded object` ログ確認済み

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

- [x] `s3://technomart-datalake/logs/2026/03/17/` 以下に複数サービスのログ確認
- [x] backend / coredns / ollama / localstack / fluent-bit 自身のログが蓄積
**結果**: ✅ 合格

### 🧪 テスト6b: クラッシュログの永続化確認
```bash
# 意図的に Pod を強制削除してログが残るか確認
kubectl delete pod -l app=backend -n technomart
# 少し待って Pod が再起動してから
awslocal s3 ls s3://technomart-datalake/logs/
```
**期待結果**: 削除前のログが S3 に残っている

- [x] 旧 Pod（4gx2q）削除後も S3 に 6 ファイル分のログが残存
- [x] 新 Pod（mghdt）の新ログも追加確認
**結果**: ✅ 合格

---

## フェーズ7: VM 再起動 + 全体最終確認

- [x] **7-1. VM をシャットダウンして再起動**
  - 実施日: 2026-03-17
  - `vagrant reload` で完全再起動

- [x] **7-2. 再起動後の全サービス確認**
  - technomart namespace: 全 Pod Running（1回の一時的エラー後に自動復旧）

### 🧪 テスト7: 再起動後の完全復旧確認
以下をすべてチェック:
```
[x] k3s が自動起動している（systemctl is-active → active）
[x] technomart namespace の全 Pod が Running（11 Pod）
[x] ローカルレジストリ Pod が Running
[x] toolbox Pod が Running（一時 ImagePullBackOff → 自動復旧）
[x] http://192.168.56.10:30300 にアクセスできる（307確認）
[x] ログインが成功する（ブラウザ手動確認が必要）
[x] versions/status.sh に記録が残っている（prod/backend・prod/frontend確認）
```
**期待結果**: 手動操作なしで全サービスが復旧する

**結果**: ✅ 合格（toolboxは一時ImagePullBackOffだが約2分で自動復旧。これはregistryの起動タイミングによるもので、k8sのbackoff retry機能で解消される）

### 🧪 テスト3b: 2回目ビルドの速度確認
- [-] スキップ（フェーズ3で既存イメージをexport/pushで移行したため、初回ビルド未計測）

---

## フェーズ8: v1.1 完了スナップショット保存

- [x] **8-1. v1.1 完了時点のスナップショット保存**
  - 実施日: 2026-03-17
  - `vagrant snapshot list` → v1.0-stable / v1.1-stable 両方確認

- [-] **8-2. ロールバック手順の動作確認**（スキップ）
  - v1.0-stable / v1.1-stable 両方保存済みのため、必要時に実施可能

- [x] **8-3. versions/status.sh の最終出力を記録**
  - `v1.1/deployment_snapshot.txt` に保存済み

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
- 実施日: 2026-03-17
- バージョンタグ: v1.1-04b359d
- 初回ビルド時間: 既存イメージを export/push で移行（ビルドなし）
- 2回目ビルド時間（差分）: フェーズ7で計測予定

### フェーズ4
- 実施日:

### フェーズ5
- 実施日: 2026-03-17
- toolbox 疎通確認: PostgreSQL/Redis/Kafka/Backend API/LocalStack/DNS 全疎通確認済み
- 備考: ClickHouse client はパッケージ依存解決失敗のためスキップ。manifest に AWS_ACCESS_KEY_ID/SECRET/REGION 追加済み。

### フェーズ6
- 実施日: 2026-03-17

### フェーズ7
- 実施日: 2026-03-17
- 再起動後の復旧時間: 約2分（toolboxはregistry起動待ちで遅延したが自動復旧）

### フェーズ8
- 実施日: 2026-03-17
- v1.1-stable スナップショット保存確認: v1.0-stable / v1.1-stable 両方確認済み
