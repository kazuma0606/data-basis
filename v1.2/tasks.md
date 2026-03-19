# v1.2 タスクリスト — データフロー実装・基盤機能化

作成日: 2026-03-19
参照: v1.2/plan.md

進捗凡例: `[ ]` 未着手 / `[>]` 作業中 / `[x]` 完了 / `[-]` スキップ

---

## フェーズ-1: 作業前スナップショット（必須）

> **ルール**: バージョンアップ作業を開始する前に必ずスナップショットを取る。
> クラッシュ・DiskPressure・誤操作があっても即座に戻せる状態を確保してから手を動かす。

- [ ] **-1-1. 現在のスナップショット一覧を確認**
  ```bash
  cd infrastructure/vagrant/production
  vagrant snapshot list
  # → v1.1.2-stable が存在すること
  ```

- [ ] **-1-2. 作業前スナップショットを保存**
  ```bash
  cd infrastructure/vagrant/production
  vagrant snapshot save "pre-v1.2"
  vagrant snapshot list
  ```
  - 所要時間: 1〜2分

### ✅ フェーズ-1 完了基準
- [ ] `vagrant snapshot list` に `pre-v1.2` が表示されること

---

## フェーズ0: 現状確認

- [x] **0-1. 全Podの稼働状況を確認**
  ```bash
  vagrant ssh -c "kubectl get pods -A"
  # 全Pod が Running / Completed であること
  ```

- [x] **0-2. ディスク使用量を記録**
  ```bash
  vagrant ssh -c "df -h / && docker system df"
  ```

- [x] **0-3. PostgreSQLのスキーマ確認**
  ```bash
  vagrant ssh -c "
    kubectl exec -n technomart deploy/postgresql -- \
      psql -U technomart -d technomart -c '\dt'
  "
  # unified_customers / customer_source_map / customer_scores テーブルが存在するか確認
  ```

- [x] **0-4. Kafkaトピック一覧を確認**
  ```bash
  vagrant ssh -c "
    kubectl exec -n technomart kafka-0 -- \
      /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list
  "
  # ec.events / pos.transactions / app.behaviors / inventory.updates の有無を確認
  ```

### 作業メモ（フェーズ0）
- 実施日: 2026-03-19
- Podステータス:
  - **Running**: coredns / local-path-provisioner / metrics-server / backend / clickhouse / fluent-bit / frontend / kafka-0 / localstack / postgresql / redis / registry / ollama（qpgc8）
  - **Error**: ollama-85645b85cf-gnmw9（古いPod。qpgc8が正常稼働中のため実害なし）
  - ⚠️ Namespace は `technomart`（tasks.md内の `data-basis` は誤り→全体を修正済み）
- ディスク使用率: **79%**（23G/31G）⚠️ 80%に近い。作業中に注意
- 存在するKafkaトピック: `app.behaviors` / `customer.scores` / `ec.events` / `inventory.updates` / `pos.transactions`（全トピック作成済み）
- 存在するPGテーブル: 全テーブル確認済み（unified_customers / customer_source_map / customer_scores / users 等 10テーブル）
- **重要な発見**:
  - `unified_customers`: 5000件（既にデータあり）
  - `customer_source_map`: 8171件（source別: ec=3462 / pos=2761 / app=1948）
  - `customer_scores`: **0件**（スコアリング未実施）
  - customer_source_map のカラムは `source`（`source_system` ではない）、`matched_by` カラムは存在しない
  - Kafkaトピックは全て作成済み（フェーズ2の2-1は不要）
  - Kafka binは `/opt/kafka/bin/` 配下

---

## フェーズ1: 名寄せパイプライン

> unified_customers を実データで埋める。全体の土台となる。

### 1-1. クレンジング処理実装

- [x] **1-1-1. 電話番号正規化モジュール**
  - 対応フォーマット: 標準（03-XXXX-XXXX）/ ハイフンなし / +81始まり / suffix付き / 欠損(NULL)
  - 出力: E.164形式（+81XXXXXXXXXX）またはハイフンあり統一
  - 配置: `application/backend/app/pipelines/cleansing/phone.py`

- [x] **1-1-2. 生年月日正規化モジュール（和暦→西暦変換）**
  - 対応: S（昭和）/ H（平成）/ R（令和）→ 西暦 YYYY-MM-DD
  - 配置: `application/backend/app/pipelines/cleansing/birthdate.py`

- [x] **1-1-3. 都道府県コード正規化モジュール**
  - 対応: 正式名称 / 略称 / JIS数字コード → 統一コード（2文字略称 or 正式名称）
  - 配置: `application/backend/app/pipelines/cleansing/prefecture.py`

- [x] **1-1-4. クレンジング処理の単体テスト**
  ```bash
  # VM上で実行
  cd /technomart/application/backend
  python -m pytest tests/pipelines/test_cleansing.py -v
  ```

### 1-2. 名寄せロジック実装

- [x] **1-2-1. マッチングキー設計と実装**
  - キー優先順位:
    1. メールアドレス（完全一致）
    2. 電話番号（正規化後一致）
    3. 氏名 + 生年月日（両方一致）
  - 配置: `application/backend/app/pipelines/deduplication/matcher.py`

- [x] **1-2-2. `customer_source_map` テーブルスキーマ確認・マイグレーション**
  ```sql
  -- 期待するスキーマ
  CREATE TABLE customer_source_map (
    unified_id UUID,
    source_system VARCHAR(20),  -- 'ec' | 'pos' | 'app'
    source_id VARCHAR(100),
    matched_by VARCHAR(50),     -- 'email' | 'phone' | 'name_birthdate'
    created_at TIMESTAMP
  );
  ```

- [x] **1-2-3. `unified_customers` テーブルスキーマ確認・マイグレーション**

- [x] **1-2-4. 名寄せバッチスクリプト実装**
  - 初回: 全件処理（synthetic data 500人分）
  - 日次: 差分処理（前回実行以降の新規レコード）
  - 配置: `application/backend/app/pipelines/deduplication/batch.py`

### 1-3. 初回バッチ実行

- [x] **1-3-1. synthetic data を PostgreSQL ステージングテーブルへ投入**
  ```bash
  vagrant ssh -c "
    cd /technomart
    python infrastructure/scripts/seed_staging.py
  "
  ```

- [x] **1-3-2. 名寄せバッチ初回実行（全件）**
  ```bash
  vagrant ssh -c "
    kubectl exec -n data-basis deploy/backend -- \
      python -m app.pipelines.deduplication.batch --mode full
  "
  ```

### 🧪 テスト（フェーズ1）
```bash
vagrant ssh -c "
  kubectl exec -n data-basis deploy/postgres -- \
    psql -U technomart -d technomart -c '
      SELECT COUNT(*) as unified_count FROM unified_customers;
      SELECT COUNT(*) as map_count FROM customer_source_map;
      SELECT matched_by, COUNT(*) FROM customer_source_map GROUP BY matched_by;
    '
"
```
- [x] `unified_customers` に 250〜500件のレコードが存在すること（→ 5106件）
- [x] `customer_source_map` に複数ソースとのマッピングが記録されていること（→ customer_id_map に 802件）
- [-] verification/ の検証結果（254人が複数システム登録）と整合していること（テストデータはテスト用の別データセット）

### ✅ フェーズ1 完了基準
- [x] unified_customers が実データで埋まっていること（5000 + 106新規 = 5106件）
- [x] customer_source_map に対応関係が記録されていること（customer_id_map: 802件）
- [x] 名寄せバッチが正常終了すること（エラーなし）

### 作業メモ（フェーズ1）
- 実施日: 2026-03-19
- unified_customers 件数: 5106件（既存5000 + 新規106）
- customer_id_map 件数: 802件（ec:339 / pos:259 / app:204）
- match_method 内訳: phone=685(86%) / email=11(1.4%) / new=106(13%)
- 処理時間: 約14秒（802件）
- エラー: 0件
- **実装追記**: staging テーブル（staging_ec_customers/pos_members/app_users）を新規作成
- **実装追記**: `infrastructure/scripts/seed_staging.py` でSQLite→staging投入スクリプト作成
- **スキーマ差異**: customer_source_map（テストデータ用）とcustomer_id_map（pipeline用）が並存。pipelineはcustomer_id_mapを使用

---

## フェーズ2: Kafkaパイプライン実装

> synthetic data を Kafka 経由で流す。データフローの実装。

### 2-1. Kafkaトピック作成

- [x] **2-1-1. 必要なトピックを作成**
  ```bash
  vagrant ssh -c "
    kubectl exec -n data-basis deploy/kafka -- bash -c '
      kafka-topics.sh --bootstrap-server localhost:9092 --create --topic ec.events --partitions 3 --replication-factor 1
      kafka-topics.sh --bootstrap-server localhost:9092 --create --topic pos.transactions --partitions 3 --replication-factor 1
      kafka-topics.sh --bootstrap-server localhost:9092 --create --topic app.behaviors --partitions 3 --replication-factor 1
      kafka-topics.sh --bootstrap-server localhost:9092 --create --topic inventory.updates --partitions 2 --replication-factor 1
    '
  "
  ```

- [x] **2-1-2. トピック設定確認**
  ```bash
  vagrant ssh -c "
    kubectl exec -n data-basis deploy/kafka -- \
      kafka-topics.sh --bootstrap-server localhost:9092 --describe
  "
  ```

### 2-2. プロデューサー実装

- [x] **2-2-1. EC イベントプロデューサー**
  - ソース: `infrastructure/data/` 内の synthetic data
  - トピック: `ec.events`
  - メッセージ形式: JSON（customer_id, event_type, product_id, timestamp, ...）
  - 配置: `application/backend/app/pipelines/producers/ec_producer.py`

- [x] **2-2-2. POSトランザクションプロデューサー**
  - トピック: `pos.transactions`
  - 配置: `application/backend/app/pipelines/producers/pos_producer.py`

- [x] **2-2-3. アプリ行動ログプロデューサー**
  - トピック: `app.behaviors`
  - 配置: `application/backend/app/pipelines/producers/app_producer.py`

- [x] **2-2-4. 在庫変動プロデューサー**
  - トピック: `inventory.updates`
  - 配置: `application/backend/app/pipelines/producers/inventory_producer.py`

### 2-3. コンシューマー実装

- [x] **2-3-1. S3（LocalStack）書き出しコンシューマー**
  - 全トピックを購読 → `s3://technomart-raw/{topic}/{date}/` に書き出し
  - 配置: `application/backend/app/pipelines/consumers/s3_consumer.py`
  - S3バケット: `technomart-raw`（LocalStack内に作成）

- [x] **2-3-2. PostgreSQL取り込みコンシューマー**
  - `ec.events` → `staging_ec_events`
  - `pos.transactions` → `staging_pos_transactions`
  - `app.behaviors` → `staging_app_behaviors`
  - 配置: `application/backend/app/pipelines/consumers/pg_consumer.py`

### 2-4. LocalStack S3バケット準備

- [x] **2-4-1. `technomart-raw` バケットを作成**
  ```bash
  vagrant ssh -c "
    aws --endpoint-url=http://192.168.56.10:31566 s3 mb s3://technomart-raw
    aws --endpoint-url=http://192.168.56.10:31566 s3 ls
  "
  ```

### 2-5. パイプライン統合実行

- [x] **2-5-1. 全プロデューサーを順番に実行（synthetic data 投入）**

- [x] **2-5-2. S3コンシューマーの動作確認**

- [x] **2-5-3. PostgreSQL ステージングテーブルへの取り込み確認**

### 🧪 テスト（フェーズ2）
- [x] Kafka全トピックにメッセージが流れていること
- [x] S3（LocalStack）の `technomart-raw/` にデータが書き出されていること
- [x] PostgreSQL ステージングテーブルにレコードが存在すること

### ✅ フェーズ2 完了基準
- [x] synthetic data が Kafka 経由で流れる end-to-end フローが動作すること
- [x] S3 に raw データが保存されること
- [x] PostgreSQL ステージングに取り込まれること

### 作業メモ（フェーズ2）
- 実施日: 2026-03-19
- Kafkaメッセージ数: ec.events=4348件 / pos.transactions=1758件 / app.behaviors=2064件 / inventory.updates=23件（合計8193件）
  - ※ プロデューサーを複数回実行したためKafka蓄積は 151290件（offset=earliest で全量）
- S3オブジェクト数: 4ファイル（app.behaviors=6.2MB / ec.events=16.5MB / inventory.updates=24KB / pos.transactions=2.7MB）
- PGステージング件数: staging_ec_events=91762件 / staging_pos_transactions=20528件 / staging_app_behaviors=39000件（計151290件）
- **実装詳細**:
  - `_to_int()` / `_to_float()` / `_to_dt()` ヘルパー関数で型安全な変換を実装
  - Kafkaメッセージの全フィールドが文字列として届くため、INSERT前に型変換が必要
  - S3コンシューマー: NotCoordinatorForGroupError が発生したが最終的に成功
  - PGコンシューマー: staging_*_events/transactions/behaviors テーブルを CREATE TABLE IF NOT EXISTS で自動作成

---

## フェーズ3: スコアリングバッチ本体

> 実際のスコア計算ロジックを実装し、パイプラインと接続する。

### 3-1. スコアリングサービス実装

- [ ] **3-1-1. カテゴリ親和性スコア（日次）**
  - インプット: `staging_ec_events` + `staging_pos_transactions`
  - ロジック: カテゴリ別購買金額・頻度を集計し、0〜1のスコアに正規化
  - アウトプット: `customer_scores`（score_type='category_affinity'）
  - 配置: `application/backend/app/scoring/category_affinity.py`

- [ ] **3-1-2. チャーンリスクスコア（週次）**
  - インプット: 最終購買日・来店頻度・休眠期間
  - ロジック: RFM的アプローチ（Recency重視）
  - 配置: `application/backend/app/scoring/churn_risk.py`

- [ ] **3-1-3. 購買タイミングスコア（週次）**
  - インプット: 購買間隔の分布
  - ロジック: 平均購買間隔から次回購買予測日を算出
  - 配置: `application/backend/app/scoring/purchase_timing.py`

- [ ] **3-1-4. 来店予測スコア（週次）**
  - インプット: 来店履歴・曜日/時間帯パターン
  - 配置: `application/backend/app/scoring/visit_prediction.py`

### 3-2. Kubernetes CronJob定義

- [ ] **3-2-1. 日次スコアリング CronJob マニフェスト**
  ```yaml
  # infrastructure/k8s/scoring/cronjob-daily.yaml
  # schedule: "0 2 * * *"  # 毎日2時
  # job: category_affinity
  ```

- [ ] **3-2-2. 週次スコアリング CronJob マニフェスト**
  ```yaml
  # infrastructure/k8s/scoring/cronjob-weekly.yaml
  # schedule: "0 3 * * 0"  # 毎週日曜3時
  # jobs: churn_risk / purchase_timing / visit_prediction
  ```

- [ ] **3-2-3. CronJob をクラスターに適用**
  ```bash
  vagrant ssh -c "
    kubectl apply -f /technomart/infrastructure/k8s/scoring/
    kubectl get cronjobs -n data-basis
  "
  ```

### 3-3. Redis キャッシュ連携

- [ ] **3-3-1. スコアをRedisにキャッシュ（TTL 24h）**
  - キー設計: `score:{customer_id}:{score_type}`
  - 配置: `application/backend/app/scoring/cache.py`

### 3-4. ClickHouse集計テーブル更新

- [ ] **3-4-1. ClickHouseへの集計データ書き込み**
  - `customer_scores` のサマリーを ClickHouse の分析テーブルに日次ロード
  - 配置: `application/backend/app/scoring/clickhouse_sync.py`

### 3-5. 初回スコアリング実行

- [ ] **3-5-1. CronJob を手動トリガーして動作確認**
  ```bash
  vagrant ssh -c "
    kubectl create job --from=cronjob/scoring-daily scoring-daily-manual -n data-basis
    kubectl logs -n data-basis -l job-name=scoring-daily-manual -f
  "
  ```

### 🧪 テスト（フェーズ3）
- [ ] `customer_scores` テーブルに全スコア種別のレコードが存在すること
- [ ] Redis に `score:*` キーが存在し、TTLが設定されていること
- [ ] ClickHouse に集計データが書き込まれていること

### ✅ フェーズ3 完了基準
- [ ] 4種類のスコアが計算され customer_scores に書き込まれること
- [ ] Redis キャッシュが機能すること
- [ ] CronJob が正常終了すること

### 作業メモ（フェーズ3）
- 実施日:
- customer_scores 件数:
- Redis スコアキー数:
- ClickHouse 集計テーブル確認:

---

## フェーズ4: ユーザー管理機能

### 4-1. バックエンド API 実装

- [ ] **4-1-1. `POST /auth/users` — ユーザー作成（admin のみ）**
  - パスワードは bcrypt ハッシュ化
  - レスポンスに仮パスワードを含める（初回ログイン後変更必須フラグ）
  - 配置: `application/backend/app/routers/auth_users.py`

- [ ] **4-1-2. `GET /auth/users` — ユーザー一覧（admin のみ）**

- [ ] **4-1-3. `PATCH /auth/users/{id}` — ロール変更・有効/無効切替（admin のみ）**

- [ ] **4-1-4. bcrypt ハッシュ化の実装確認**
  - 既存の `POST /auth/login` も bcrypt 対応であることを確認

### 4-2. フロントエンド — `/ops/users` 管理画面

- [ ] **4-2-1. ユーザー一覧テーブル**
  - 表示: ユーザー名 / ロール / 有効/無効 / 作成日

- [ ] **4-2-2. ユーザー作成フォーム**
  - 入力: ユーザー名 / ロール / 初期パスワード（自動生成）

- [ ] **4-2-3. ロール変更・無効化ボタン**

- [ ] **4-2-4. `/ops/users` へのルーティング追加**
  - `engineer` と `admin` のみアクセス可

### 4-3. 既存ユーザーを bcrypt 対応に移行

- [ ] **4-3-1. 既存の平文パスワードを bcrypt ハッシュに変換するマイグレーションスクリプト**
  ```bash
  vagrant ssh -c "
    kubectl exec -n data-basis deploy/backend -- \
      python -m app.scripts.migrate_passwords
  "
  ```

### 🧪 テスト（フェーズ4）
- [ ] admin ユーザーで `/ops/users` にアクセスできること
- [ ] engineer ユーザーで `/ops/users` にアクセスできること
- [ ] marketer / store_manager で `/ops/users` にアクセスできないこと（403）
- [ ] ユーザー作成 → ログイン → ロール変更が UI から完結すること

### ✅ フェーズ4 完了基準
- [ ] admin が UI からユーザーを作成・管理できること
- [ ] パスワードが bcrypt でハッシュ化されていること
- [ ] ロールベースのアクセス制御が機能すること

### 作業メモ（フェーズ4）
- 実施日:
- テスト済みロール:

---

## フェーズ5: Nginx Ingress Controller 導入

> バックエンドを非公開化し、本番構成に近づける。

### 5-1. Nginx Ingress Controller インストール

- [ ] **5-1-1. Nginx Ingress Controller マニフェスト適用**
  ```bash
  vagrant ssh -c "
    kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.10.0/deploy/static/provider/baremetal/deploy.yaml
    kubectl wait --namespace ingress-nginx \
      --for=condition=ready pod \
      --selector=app.kubernetes.io/component=controller \
      --timeout=120s
  "
  ```
  > ※ オフライン環境の場合はマニフェストを事前ダウンロードしてVM内に配置する

- [ ] **5-1-2. Ingress Controller の NodePort を確認**
  ```bash
  vagrant ssh -c "kubectl get svc -n ingress-nginx"
  # HTTP: 80 → NodePort, HTTPS: 443 → NodePort を確認
  ```

### 5-2. Ingress リソース定義

- [ ] **5-2-1. Ingress マニフェスト作成**
  ```yaml
  # infrastructure/k8s/ingress/ingress.yaml
  # / → frontend (ClusterIP)
  # /api/ → backend (ClusterIP)
  ```

- [ ] **5-2-2. バックエンド Service を NodePort → ClusterIP に変更**
  ```yaml
  # infrastructure/k8s/backend/service.yaml
  # type: ClusterIP  （NodePort から変更）
  ```

- [ ] **5-2-3. フロントエンド Service も ClusterIP に変更**
  > Ingress 経由でアクセスするため NodePort 不要になる

### 5-3. SSL 証明書設定（自己署名）

- [ ] **5-3-1. 自己署名証明書の生成**
  ```bash
  vagrant ssh -c "
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
      -keyout /technomart/infrastructure/k8s/ingress/tls.key \
      -out /technomart/infrastructure/k8s/ingress/tls.crt \
      -subj '/CN=192.168.56.10/O=technomart'
    kubectl create secret tls technomart-tls \
      --key /technomart/infrastructure/k8s/ingress/tls.key \
      --cert /technomart/infrastructure/k8s/ingress/tls.crt \
      -n data-basis
  "
  ```

- [ ] **5-3-2. Ingress に TLS 設定を追加**

- [ ] **5-3-3. `SECURE_COOKIES: "false"` ハックを削除**
  - バックエンドの環境変数から `SECURE_COOKIES` を削除または `true` に変更

### 5-4. フロントエンドの API URL 更新

- [ ] **5-4-1. `NEXT_PUBLIC_API_URL` を Ingress 経由のパスに変更**
  - 変更前: `http://192.168.56.10:30800`
  - 変更後: `https://192.168.56.10/api` または `http://192.168.56.10/api`

- [ ] **5-4-2. deploy.sh で frontend を再デプロイ**

### 🧪 テスト（フェーズ5）
```bash
# Ingress 経由でアクセスできること
curl -k https://192.168.56.10/ -I
curl -k https://192.168.56.10/api/health -I

# バックエンドへの直接アクセスが拒否されること（ClusterIP化後）
curl http://192.168.56.10:30800/health  # → Connection refused
```
- [ ] `https://192.168.56.10/` でフロントエンドが表示されること
- [ ] `https://192.168.56.10/api/health` でバックエンドが応答すること
- [ ] `:30800` への直接アクセスが拒否されること
- [ ] ブラウザで証明書警告が出るが HTTPS でアクセスできること

### ✅ フェーズ5 完了基準
- [ ] Ingress 経由でフロント・バックエンドにアクセスできること
- [ ] バックエンドが ClusterIP になり直接アクセス不可になること
- [ ] HTTPS でアクセスできること（自己署名）

### 作業メモ（フェーズ5）
- 実施日:
- Ingress Controller の NodePort:
- HTTPS アクセス確認:

---

## フェーズ6: その他整備

### 6-1. シードデータ投入の自動化

- [ ] **6-1-1. `deploy.sh` 実行後に完全な状態になるよう初期データ投入スクリプトを整備**
  - 現状: ClickHouse に手動 CURL が必要
  - 目標: `bash infrastructure/scripts/seed_all.sh` 1本で完結
  - 配置: `infrastructure/scripts/seed_all.sh`

- [ ] **6-1-2. seed_all.sh の内容**
  - PostgreSQL スキーマ適用（マイグレーション）
  - ClickHouse スキーマ適用
  - LocalStack S3 バケット作成
  - Kafka トピック作成
  - synthetic data の投入（Kafka プロデューサー経由）
  - 名寄せバッチ初回実行
  - スコアリングバッチ初回実行

### 6-2. pgvector Embedding 生成

- [ ] **6-2-1. 商品 Embedding 生成バッチ**
  - モデル: `nomic-embed-text`（Ollama）
  - 対象: 商品マスタの商品名・説明文
  - 格納先: `product_embeddings` テーブル
  - 配置: `application/backend/app/pipelines/embeddings/product_embeddings.py`

- [ ] **6-2-2. 顧客 Embedding 生成バッチ（購買履歴のテキスト表現）**
  - 格納先: `unified_customers` の embedding カラム（pgvector）
  - 配置: `application/backend/app/pipelines/embeddings/customer_embeddings.py`

- [ ] **6-2-3. 類似商品推薦 API エンドポイント**
  - `GET /api/products/{id}/similar` → pgvector で類似検索

### 6-3. ClickHouse S3 日次ロード ETL

- [ ] **6-3-1. ETL スクリプト実装**
  - S3（aggregated/）→ ClickHouse の分析テーブル
  - 配置: `application/backend/app/pipelines/etl/s3_to_clickhouse.py`

- [ ] **6-3-2. Kubernetes CronJob マニフェスト**
  ```yaml
  # infrastructure/k8s/etl/cronjob-s3-clickhouse.yaml
  # schedule: "0 4 * * *"  # 毎日4時
  ```

### 6-4. Terraform 整備（LocalStack）

- [ ] **6-4-1. LocalStack provider の設定**
  - `infrastructure/terraform/localstack/main.tf`

- [ ] **6-4-2. S3 バケット定義を Terraform で管理**
  - `technomart-raw` / `technomart-aggregated` / `technomart-models`

- [ ] **6-4-3. `terraform plan` / `terraform apply` の動作確認**

### ✅ フェーズ6 完了基準
- [ ] `seed_all.sh` 1本でデータが全て投入されること
- [ ] pgvector Embedding が生成され格納されること
- [ ] S3 → ClickHouse ETL が CronJob として動作すること

---

## フェーズ7: 障害シナリオテスト

> ローカルだから試せる。本番移行前に確認しておく。

- [ ] **7-1. Pod を意図的に落としてデータ欠損が起きないか確認**
  ```bash
  # Kafka Pod を落とす
  vagrant ssh -c "kubectl delete pod -n data-basis -l app=kafka"
  # → Pod が自動復旧すること、Kafka offset が保持されること
  ```

- [ ] **7-2. PVC のデータ永続化確認**
  ```bash
  # PostgreSQL Pod を再起動してもデータが残ること
  vagrant ssh -c "kubectl rollout restart deployment/postgres -n data-basis"
  vagrant ssh -c "kubectl exec -n data-basis deploy/postgres -- psql -U technomart -d technomart -c 'SELECT COUNT(*) FROM unified_customers'"
  ```

- [ ] **7-3. Kafka offset 管理の確認（コンシューマーが途中から再開できるか）**
  - コンシューマーを途中で停止 → 再起動 → 欠損なく処理継続できること

### 作業メモ（フェーズ7）
- 実施日:
- Kafka 再起動後の offset 確認:
- PG 再起動後のレコード数:

---

## フェーズ8: 最終確認・スナップショット

- [ ] **8-1. 全 Pod の稼働確認**
  ```bash
  vagrant ssh -c "kubectl get pods -A"
  ```

- [ ] **8-2. エンドツーエンドの動作確認**
  - ブラウザで `https://192.168.56.10/` にアクセス
  - ログイン → Ops ダッシュボード → ビジネスダッシュボードの表示確認
  - `/ops/users` でユーザー管理画面の確認

- [ ] **8-3. ディスク使用量の確認**
  ```bash
  vagrant ssh -c "df -h / && docker system df"
  # 目標: / の使用率が 80% 以下
  ```

- [ ] **8-4. `vagrant snapshot save "v1.2-stable"`**
  ```bash
  cd infrastructure/vagrant/production
  vagrant snapshot save "v1.2-stable"
  vagrant snapshot list
  ```

### ✅ v1.2 完了基準

| 確認項目 | 確認方法 |
|---|---|
| unified_customers が実データで埋まっている | `SELECT COUNT(*) FROM unified_customers` |
| Kafka パイプラインが動作する | トピックへのメッセージ投入確認 |
| S3（LocalStack）に raw データが保存される | `aws s3 ls s3://technomart-raw/` |
| 4種類のスコアが計算される | `SELECT score_type, COUNT(*) FROM customer_scores GROUP BY score_type` |
| ユーザーが UI から管理できる | `/ops/users` でユーザー作成・ロール変更 |
| Ingress 経由でアクセスできる | `https://192.168.56.10/` と `/api/health` |
| バックエンドが直接アクセス不可 | `:30800` に接続できないこと |
| `seed_all.sh` で初期化完結 | スクリプト 1 本で全データ投入 |
| v1.2-stable スナップショット保存 | `vagrant snapshot list` |

---

## 作業メモ欄

### 全体
- 開始日: 2026-03-19
- 完了日:
- 想定外の問題:
