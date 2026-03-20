# v1.1 アップデート計画 — 運用安定化

作成日: 2026-03-17
前提: v1.0（疎通確認完了）の直後に着手。v1.2の開発を始める前に完了させる。

---

## 目的

v1.0では「動くことの確認」ができた。
v1.1では「開発・運用サイクルを止めない」環境を整える。

Podが落ちても原因がわからない、ビルドのたびに数分待つ、
再起動後にサービスが死んでいる、という状態ではv1.2の開発が進まない。

---

## スコープ

### 1. ローカルコンテナレジストリによるビルド効率化

#### 現状の問題

```
docker build → docker save → pipe → sudo k3s ctr images import -
```

- `docker save | import` はイメージ全体をシェルパイプで毎回フル転送する
- 差分がなくても全レイヤーをコピーするため遅い
- `imagePullPolicy: Never` のためデプロイのたびに手動インポートが必要

#### 解決策：ローカルレジストリ（registry:2）をk3s内に立てる

```
docker build → docker push localhost:5000/... → k8s が自動pull
```

**構成**:
- `registry:2`（Docker公式のレジストリイメージ）をk3s上のDeploymentとして起動
- NodePort `:32500` でVMからアクセス可能にする
- k3sのcontainerdにinsecure registryとして登録する（HTTPで通信）
- 各k8sマニフェストのimageを `localhost:5000/technomart-xxx:latest` に変更
- `imagePullPolicy: Always` に変更（pushするだけでrollout restartが効く）

**変更後のビルドフロー**:
```bash
# バックエンドのビルドとデプロイ（deploy.shから抜粋）
docker build -t localhost:5000/technomart-backend:latest "$APP_DIR/backend"
docker push localhost:5000/technomart-backend:latest
kubectl rollout restart deployment/backend -n "$NAMESPACE"
kubectl rollout status deployment/backend -n "$NAMESPACE" --timeout=3m
```

`docker save | sudo k3s ctr images import -` が完全に不要になる。
pushは差分レイヤーのみ転送するため、2回目以降が大幅に速くなる。

**AWS移行時**: ECRに置き換えるだけ。pushコマンドのURLを変えるのみ。

**実装ファイル**:
- `infrastructure/k8s/registry/manifest.yaml` — レジストリDeployment + Service
- `/etc/rancher/k3s/registries.yaml` — k3s insecure registry設定（VM内）
- `infrastructure/scripts/deploy.sh` — ビルドフローを全面改訂

---

### 2. VM再起動時のk3s自動起動

#### 現状の問題

VMを再起動するとk3sが起動していない、またはPodが
`ErrImageNeverPull` で落ちたまま誰も気づかない。

#### 解決策

**k3s systemdサービスの有効化**:
```bash
sudo systemctl enable k3s
# 確認
sudo systemctl status k3s
```

k3sはインストール時にsystemdユニットファイルが `/etc/systemd/system/k3s.service`
として作成されている。`enable` するだけで再起動後に自動起動する。

**Pod自動復旧の前提**:
課題1（ローカルレジストリ）と合わせて対応する必要がある。

- `imagePullPolicy: Never` のままだと、k3sが起動してもPodが
  `ErrImageNeverPull` で落ちてサービスが復旧しない
- ローカルレジストリから `imagePullPolicy: Always` でpullする構成にすることで、
  k3s起動 → Pod自動起動 → レジストリからpull → 正常起動、の流れになる

**確認手順（VM再起動後）**:
```bash
sudo systemctl status k3s
kubectl get pods -n technomart
kubectl get pods -n monitoring   # v1.3以降
```

---

### 3. 診断Pod（toolbox）の常時起動

#### 目的

Podが落ちたとき、ネットワーク疎通が取れないとき、
DBに直接接続して確認したいときに使うデバッグ専用コンテナ。

#### toolboxコンテナの作り方

既製イメージ（`nicolaka/netshoot` 等）は外部pull依存になるため、
このプロジェクトでは**カスタムDockerfileで自前ビルドする**。

ビルドしてローカルレジストリにpushし、他のサービスと同じ流れで管理する。

**`infrastructure/k8s/toolbox/Dockerfile`**:
```dockerfile
FROM ubuntu:24.04

RUN apt-get update && apt-get install -y \
    # ネットワーク診断
    curl wget \
    dnsutils \          # dig, nslookup
    iputils-ping \      # ping
    netcat-openbsd \    # nc（ポート疎通確認）
    tcpdump \
    iproute2 \          # ss, ip
    # データ形式
    jq \
    # PostgreSQL クライアント
    postgresql-client \
    # Redis クライアント
    redis-tools \
    # エディタ
    vim \
    && rm -rf /var/lib/apt/lists/*

# Kafka クライアント（kcat）
RUN apt-get update && apt-get install -y kcat \
    && rm -rf /var/lib/apt/lists/*

# ClickHouse クライアント
RUN curl -fsSL https://packages.clickhouse.com/rpm/lts/repodata/repomd.xml | \
    apt-get install -y clickhouse-client 2>/dev/null || \
    curl https://clickhouse.com/ | sh

# AWS CLI（LocalStack接続用）
RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscli.zip \
    && apt-get install -y unzip \
    && unzip /tmp/awscli.zip -d /tmp \
    && /tmp/aws/install \
    && rm -rf /tmp/awscli.zip /tmp/aws

# awslocal wrapper（LocalStack向けエイリアス）
RUN echo '#!/bin/bash\naws --endpoint-url=http://localstack.technomart.svc.cluster.local:4566 "$@"' \
    > /usr/local/bin/awslocal && chmod +x /usr/local/bin/awslocal

CMD ["sleep", "infinity"]
```

**ビルドとpush**:
```bash
docker build -t localhost:5000/technomart-toolbox:latest \
  infrastructure/k8s/toolbox/
docker push localhost:5000/technomart-toolbox:latest
```

**`infrastructure/k8s/toolbox/manifest.yaml`**:
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: toolbox
  namespace: technomart
  labels:
    app: toolbox
spec:
  containers:
    - name: toolbox
      image: localhost:5000/technomart-toolbox:latest
      imagePullPolicy: Always
      command: ["sleep", "infinity"]
      env:
        - name: PGHOST
          value: postgresql.technomart.svc.cluster.local
        - name: PGPORT
          value: "5432"
        - name: PGDATABASE
          value: technomart
        - name: PGUSER
          value: technomart
        - name: PGPASSWORD
          value: technomart
  restartPolicy: Always
```

**使い方**:
```bash
# toolboxに入る
kubectl exec -it toolbox -n technomart -- bash

# 中でできること
psql                                          # PostgreSQL直接接続（ENV設定済み）
redis-cli -h redis.technomart.svc.cluster.local -p 6379
kcat -b kafka.technomart.svc.cluster.local:9092 -L   # Kafkaトピック一覧
curl http://backend.technomart.svc.cluster.local:8000/health
dig postgresql.technomart.svc.cluster.local
awslocal s3 ls                                # LocalStack S3確認
```

---

### 4. ログ蓄積（Fluent Bit）

#### 現状の問題

- `kubectl logs` は現在稼働中のコンテナのログのみ参照できる
- Podがクラッシュして再起動すると前のログは消える
- `kubectl logs --previous` で1世代前は見られるが、複数回クラッシュすると消える
- ディスクプレッシャーによるEvictionは `kubectl describe node` を見ないと気づかない

#### 解決策：Fluent Bit DaemonSet → LocalStack S3

Fluent BitをDaemonSetとして全ノードに配置し、
`/var/log/containers/*.log` を収集してLocalStack S3に転送する。

```
各Pod のログ
  └─ /var/log/containers/*.log（ノード上のファイル）
        └─ Fluent Bit（DaemonSet）
              └─ LocalStack S3: s3://technomart-datalake/logs/YYYY/MM/DD/
```

**メリット**:
- Podがクラッシュ・再起動してもログがS3に残る
- ClickHouseへのログロードも将来的に可能（v1.3でGrafana Lokiと組み合わせも可）
- LocalStackなので外部依存なし

**AWS移行時**: LocalStack S3 → Amazon S3に向き先を変えるだけ。

**実装ファイル**:
- `infrastructure/k8s/fluent-bit/manifest.yaml` — DaemonSet + ConfigMap

**ConfigMapの主要設定**:
```ini
[INPUT]
    Name              tail
    Path              /var/log/containers/*.log
    Parser            docker
    Tag               kube.*
    Refresh_Interval  5

[FILTER]
    Name              kubernetes
    Match             kube.*
    Merge_Log         On

[OUTPUT]
    Name              s3
    Match             *
    bucket            technomart-datalake
    region            ap-northeast-1
    endpoint          http://localstack.technomart.svc.cluster.local:4566
    s3_key_format     /logs/%Y/%m/%d/$TAG[4].%H%M%S.log.gz
    total_file_size   10M
    upload_timeout    10m
```

---

### 5. イメージバージョンタグ化（:latest廃止）

#### 現状の問題

```yaml
image: localhost:5000/technomart-backend:latest
```

`:latest`を使い続ける限り「今k3sで動いているのはどのコードか」が追跡できない。
デプロイのたびに上書きされるため、ロールバックも困難。

#### 解決策：セマンティックバージョン + gitハッシュの組み合わせ

```
イメージタグ形式: {semver}-{git_short_hash}
例: localhost:5000/technomart-backend:v1.1-a3f9c12
```

- `semver`はリポジトリルートの`VERSION`ファイルで管理（手動でbump）
- `git_short_hash`はビルド時に自動付与
- `latest`タグも同時に更新（後方互換）

```bash
# ビルド例（deploy.shに組み込む）
SEMVER=$(cat VERSION)                        # 例: v1.1
GIT_HASH=$(git rev-parse --short HEAD)       # 例: a3f9c12
TAG="${SEMVER}-${GIT_HASH}"                  # 例: v1.1-a3f9c12

docker build -t localhost:5000/technomart-backend:${TAG} .
docker build -t localhost:5000/technomart-backend:latest .
docker push localhost:5000/technomart-backend:${TAG}
docker push localhost:5000/technomart-backend:latest

# デプロイ時はバージョン付きタグを明示
kubectl set image deployment/backend \
  backend=localhost:5000/technomart-backend:${TAG} -n technomart
```

---

### 6. dev / prod Namespace分離

#### 目的

開発中のコードが「動いている状態」のサービスに影響しないよう、
同一k3sクラスター内で2つの環境を分離する。

```
k3s cluster (192.168.56.10)
  ├── namespace: technomart      ← prod相当（安定版）
  └── namespace: technomart-dev ← 開発・検証用
```

- `technomart`（prod）はVagrantスナップショットで保護した状態に対応
- `technomart-dev`は壊してもよい環境
- `deploy.sh`に`--env dev`オプションを追加し、Namespace + imageタグを切り替える

**Vagrant snapshotとの組み合わせ**:
```bash
# 安定した状態をスナップショットとして保存
vagrant snapshot save "v1.0.1-stable"

# 何か壊れたら戻す
vagrant snapshot restore "v1.0.1-stable"
```

スナップショットは「k3sノード自体の緊急脱出口」として使う。
日常的なバージョン管理はイメージタグ + 後述のデプロイ管理DBが担う。

---

### 7. デプロイバージョン管理（SQLite）

#### 目的

「どの環境に何のバージョンが今デプロイされているか」をホスト側（Windows）で把握できるようにする。
k8sの外側に独立したレコードを持つことで、クラスターが壊れても履歴が残る。

#### ディレクトリ構成

```
data-basis/
  versions/
    deployments.db    # SQLite DB本体（gitignore対象）
    schema.sql        # DBスキーマ定義（gitで管理）
    status.sh         # 現在の状態を表示するスクリプト
    history.sh        # デプロイ履歴を表示するスクリプト
    record.sh         # deploy.shから呼び出してレコードを記録するスクリプト
```

#### スキーマ設計（`versions/schema.sql`）

```sql
-- デプロイ履歴（全件保持）
CREATE TABLE IF NOT EXISTS deployments (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    deployed_at   TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
    environment   TEXT    NOT NULL,   -- 'prod' | 'dev'
    service       TEXT    NOT NULL,   -- 'backend' | 'frontend' | 'toolbox' | 'all'
    semver        TEXT    NOT NULL,   -- 'v1.0.1'
    git_hash      TEXT    NOT NULL,   -- 'a3f9c12'
    git_branch    TEXT,               -- 'main' | 'feature/xxx'
    image_ref     TEXT    NOT NULL,   -- 'localhost:5000/technomart-backend:v1.0.1-a3f9c12'
    status        TEXT    NOT NULL,   -- 'success' | 'failed' | 'rolled_back'
    notes         TEXT                -- 任意メモ
);

-- 現在の状態（environment + service ごとに1件）
CREATE TABLE IF NOT EXISTS current_state (
    environment   TEXT    NOT NULL,
    service       TEXT    NOT NULL,
    semver        TEXT    NOT NULL,
    git_hash      TEXT    NOT NULL,
    image_ref     TEXT    NOT NULL,
    deployed_at   TEXT    NOT NULL,
    PRIMARY KEY (environment, service)
);
```

#### 記録スクリプト（`versions/record.sh`）

```bash
#!/bin/bash
# 使い方: versions/record.sh <env> <service> <semver> <git_hash> <image_ref> [notes]
DB="$(cd "$(dirname "$0")" && pwd)/deployments.db"

ENV=$1; SERVICE=$2; SEMVER=$3; GIT_HASH=$4; IMAGE_REF=$5; NOTES=${6:-""}
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")

sqlite3 "$DB" <<SQL
INSERT INTO deployments
  (environment, service, semver, git_hash, git_branch, image_ref, status, notes)
VALUES
  ('$ENV', '$SERVICE', '$SEMVER', '$GIT_HASH', '$BRANCH', '$IMAGE_REF', 'success', '$NOTES');

INSERT OR REPLACE INTO current_state
  (environment, service, semver, git_hash, image_ref, deployed_at)
VALUES
  ('$ENV', '$SERVICE', '$SEMVER', '$GIT_HASH', '$IMAGE_REF', datetime('now', 'localtime'));
SQL
```

#### 確認コマンド（`versions/status.sh`）

```bash
#!/bin/bash
DB="$(cd "$(dirname "$0")" && pwd)/deployments.db"

echo "=== 現在のデプロイ状態 ==="
sqlite3 -header -column "$DB" \
  "SELECT environment, service, semver, git_hash, deployed_at
   FROM current_state
   ORDER BY environment, service;"

echo ""
echo "=== 直近10件のデプロイ履歴 ==="
sqlite3 -header -column "$DB" \
  "SELECT deployed_at, environment, service, semver, git_hash, status
   FROM deployments
   ORDER BY id DESC
   LIMIT 10;"
```

実行例：
```
=== 現在のデプロイ状態 ===
environment  service   semver   git_hash  deployed_at
-----------  --------  -------  --------  -------------------
dev          backend   v1.1      a3f9c12   2026-03-17 14:23:01
dev          frontend  v1.1      a3f9c12   2026-03-17 14:25:44
prod         backend   v1.1      8b2e904   2026-03-16 10:00:00
prod         frontend  v1.1      8b2e904   2026-03-16 10:02:15
```

#### deploy.sh への組み込みイメージ

```bash
# deploy.sh の該当箇所（バックエンド部分の抜粋）
SEMVER=$(cat VERSION)
GIT_HASH=$(git rev-parse --short HEAD)
TAG="${SEMVER}-${GIT_HASH}"
ENV="${DEPLOY_ENV:-prod}"   # デフォルトはprod、dev指定は --env dev

IMAGE="localhost:5000/technomart-backend:${TAG}"
docker build -t "$IMAGE" "$APP_DIR/backend"
docker push "$IMAGE"
kubectl set image deployment/backend backend="$IMAGE" -n "technomart${ENV:+-$ENV}"
kubectl rollout status deployment/backend -n "technomart${ENV:+-$ENV}" --timeout=3m

# バージョン記録
versions/record.sh "$ENV" "backend" "$SEMVER" "$GIT_HASH" "$IMAGE"
```

---

## 実装順序

```
Step 1: ローカルレジストリ（registry:2）のデプロイ
Step 2: k3s registries.yaml の設定（insecure registry登録）
Step 3: VERSIONファイルをルートに作成（初期値: v1.1）
Step 4: versions/ ディレクトリ作成・schema.sql / *.sh 配置・DB初期化
Step 5: deploy.sh の全面改訂（save/import → push / バージョンタグ付与 / record.sh呼び出し）
Step 6: 全マニフェストのimage URLをlocalhost:5000/...に変更・imagePullPolicy修正
Step 7: k3s systemd enable の確認・設定
Step 8: namespace: technomart-dev の作成
Step 9: toolbox Dockerfile作成・ビルド・マニフェスト追加
Step 10: Fluent Bit DaemonSet のデプロイ
Step 11: VM再起動テスト（全Pod自動復旧の確認）
Step 12: Vagrant snapshot "v1.1-stable" の保存
```

---

## v1.1完了後の確認ポイント

| 確認項目 | 手順 |
|---|---|
| ビルドが速くなったか | 2回目以降のdocker pushの時間を計測 |
| イメージにバージョンタグが付いているか | `docker images \| grep technomart` |
| デプロイ記録がDBに残るか | `versions/status.sh` |
| VM再起動後に全Pod復旧するか | `vagrant reload` → `kubectl get pods -n technomart` |
| toolboxから各サービスに接続できるか | psql / redis-cli / kcat / curl |
| ログがS3に届いているか | `awslocal s3 ls s3://technomart-datalake/logs/` |
| dev/prod Namespaceが分離されているか | `kubectl get ns` |

---

## バージョン体系の整理

```
v1.0    疎通確認完了（2026-03-16）
v1.1    運用安定化（本ドキュメント）← ここ
v1.2    データフロー実装（Kafka / 名寄せ / スコアリング / ユーザー管理）
v1.3    監視・オブザーバビリティ（Prometheus / Grafana / SLO）
```
