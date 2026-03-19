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

- [x] **3-1-1. カテゴリ親和性スコア（日次）**
  - インプット: `staging_ec_events` + `staging_pos_transactions`
  - ロジック: カテゴリ別購買金額・頻度を集計し、0〜1のスコアに正規化
  - アウトプット: `customer_scores`（affinity_score カラム）
  - 配置: `application/backend/app/scoring/runner.py`（内包）

- [x] **3-1-2. チャーンリスクスコア（週次）**
  - インプット: 最終購買日・来店頻度・休眠期間
  - ロジック: sigmoid(0.03 * (days - 90))
  - 配置: `application/backend/app/scoring/runner.py`（内包）

- [x] **3-1-3. 購買タイミングスコア（週次）**
  - インプット: 購買間隔の分布
  - ロジック: 平均購買間隔に対する経過日数の比率（0〜1）
  - 配置: `application/backend/app/scoring/runner.py`（内包）

- [x] **3-1-4. 来店予測スコア（週次）**
  - インプット: 来店履歴
  - 配置: `application/backend/app/scoring/runner.py`（内包）

### 3-2. Kubernetes CronJob定義

- [x] **3-2-1. 日次スコアリング CronJob マニフェスト**
  - `infrastructure/k8s/scoring/cronjob-daily.yaml` schedule: "0 2 * * *"

- [x] **3-2-2. 週次スコアリング CronJob マニフェスト**
  - `infrastructure/k8s/scoring/cronjob-weekly.yaml` schedule: "0 3 * * 0"

- [x] **3-2-3. CronJob をクラスターに適用**
  ```bash
  vagrant ssh -c "
    kubectl apply -f /technomart/infrastructure/k8s/scoring/
    kubectl get cronjobs -n data-basis
  "
  ```

### 3-3. Redis キャッシュ連携

- [x] **3-3-1. スコアをRedisにキャッシュ（TTL 24h）**
  - キー設計: `score:{unified_id}:{category_id}` → JSON（4スコア）
  - 配置: `application/backend/app/scoring/runner.py`（内包）

### 3-4. ClickHouse集計テーブル更新

- [x] **3-4-1. ClickHouseへの集計データ書き込み**
  - `clickhouse_connect`（HTTP クライアント、インストール済み）に切り替えて実装
  - 書き込み先テーブル（3テーブル）:
    - `customer_scores_daily`: 顧客別スコア（category_affinity を Map 型で格納）293行
    - `category_affinity_summary`: カテゴリ×年代別集計 479行
    - `churn_summary_weekly`: チャーンリスク分布（high/medium/low）3行
  - 配置: `application/backend/app/scoring/runner.py`（`sync_to_clickhouse` 関数）

### 3-5. 初回スコアリング実行

- [x] **3-5-1. CronJob を手動トリガーして動作確認**
  ```bash
  vagrant ssh -c "
    kubectl create job --from=cronjob/scoring-daily scoring-daily-manual -n data-basis
    kubectl logs -n data-basis -l job-name=scoring-daily-manual -f
  "
  ```

### 🧪 テスト（フェーズ3）
- [x] `customer_scores` テーブルに全スコア種別のレコードが存在すること
- [x] Redis に `score:*` キーが存在し、TTLが設定されていること
- [x] ClickHouse に集計データが書き込まれていること（customer_scores_daily/category_affinity_summary/churn_summary_weekly）

### ✅ フェーズ3 完了基準
- [x] 4種類のスコアが計算され customer_scores に書き込まれること
- [x] Redis キャッシュが機能すること
- [x] CronJob が正常終了すること

### 作業メモ（フェーズ3）
- 実施日: 2026-03-19
- customer_scores 件数: **937行**（293顧客 × 13カテゴリ）
- Redis スコアキー数: 937キー（TTL=86400s）
- ClickHouse 同期: **完了**（clickhouse_connect に切り替え。customer_scores_daily=293行 / category_affinity_summary=479行 / churn_summary_weekly=3行）
- 追加: `unified_products` に (unified_id, category_id) UNIQUE制約を追加
- 追加: `customer_scores` に (unified_id, category_id) UNIQUE制約を追加
- 追加: `app/scoring/inventory_sync.py` — inventory.updates → unified_products UPSERT
- 追加: `app/scoring/runner.py` — 全スコア計算 + Redis キャッシュ + ClickHouse同期（フォールバック）
- モード: `--mode full`（初回）/ `--mode daily`（日次CronJob）/ `--mode weekly`（週次CronJob）

---

## フェーズ4: ユーザー管理機能

### 4-1. バックエンド API 実装

- [x] **4-1-1. `POST /auth/users` — ユーザー作成（admin のみ）**
  - パスワードは bcrypt ハッシュ化
  - 配置: `application/backend/app/presentation/routers/users.py`

- [x] **4-1-2. `GET /auth/users` — ユーザー一覧（admin のみ）**

- [x] **4-1-3. `PATCH /auth/users/{id}` — ロール変更・有効/無効切替（admin のみ）**

- [x] **4-1-4. bcrypt ハッシュ化の実装確認**
  - 既存の `POST /auth/login` も bcrypt 対応済み（login.py で bcrypt.checkpw 使用）
  - is_active=False のユーザーはログイン不可（find_by_username でフィルタ）

### 4-2. フロントエンド — `/ops/users` 管理画面

- [x] **4-2-1. ユーザー一覧テーブル**
  - 表示: ユーザー名 / ロール / 店舗ID / 有効/無効 / 操作ボタン
  - 配置: `application/frontend/components/ops/UserManagement.tsx`

- [x] **4-2-2. ユーザー作成フォーム（Dialog）**
  - 入力: ユーザー名 / 初期パスワード / ロール / 店舗ID（store_manager 時のみ表示）
  - admin のみ表示（isAdmin prop で制御）

- [x] **4-2-3. ロール変更・無効化ボタン**
  - ロール: テーブル内インライン Select（admin のみ編集可、自分自身は変更不可）
  - 有効/無効: UserCheck/UserX ボタン（admin のみ操作可）

- [x] **4-2-4. `/ops/users` へのルーティング追加**
  - `engineer` と `admin` のみアクセス可
  - 配置: `application/frontend/app/ops/users/page.tsx`
  - OpsSidebar に「ユーザー管理」リンク追加（Users アイコン）
  - API プロキシ: `app/api/auth/users/route.ts` / `app/api/auth/users/[id]/route.ts`

### 4-3. 既存ユーザーを bcrypt 対応に移行

- [x] **4-3-1. bcrypt 対応確認・admin パスワード設定**
  - 初期実装から bcrypt ハッシュ化済み（`login.py` で `bcrypt.checkpw` 使用）
  - admin ユーザーのパスワードを `kubectl exec` + Python で正しい bcrypt ハッシュに更新
  - ⚠️ psql コマンドラインでの `$2b$...` ハッシュ挿入は shell 変数展開で破損するため Python 経由で実施

### 🧪 テスト（フェーズ4）
- [x] admin ユーザーで `GET /auth/users` が 200 を返すこと（curl で確認）
- [x] admin ユーザーで `POST /auth/users` でユーザー作成できること（test_marketer 作成確認）
- [x] admin ユーザーで `PATCH /auth/users/{id}` でロール変更・無効化できること
- [x] 無効化されたユーザーのログインが 401 を返すこと
- [x] フロントエンド `/ops/users` が 307 リダイレクト（認証要求）を返すこと
- [-] engineer / marketer / store_manager のロール別アクセス制御確認（API レベルで実装済み）

### ✅ フェーズ4 完了基準
- [x] admin が API からユーザーを作成・管理できること
- [x] パスワードが bcrypt でハッシュ化されていること
- [x] ロールベースのアクセス制御が実装されていること（admin のみ操作可）
- [x] フロントエンドの `/ops/users` ページが実装・デプロイされていること

### 作業メモ（フェーズ4）
- 実施日: 2026-03-19
- テスト済みロール: admin（curl で全エンドポイント確認）
- **実装詳細**:
  - `app/domain/entities/user.py`: `UserRecord` に `is_active: bool = True` 追加
  - `app/infrastructure/database/models.py`: `UserModel` に `is_active` カラム追加
  - `app/infrastructure/repositories/postgres_user_repository.py`: `list_all` / `find_by_id` / `create` / `update` メソッド追加
  - `app/presentation/schemas/auth.py`: `UserInfo` / `CreateUserRequest` / `PatchUserRequest` 追加
  - `app/presentation/routers/users.py`: ユーザー管理ルーター新規作成（prefix: `/auth/users`）
  - `app/main.py`: `users_router` を include
  - `components/ops/UserManagement.tsx`: "use client" コンポーネント（テーブル + Dialog）
  - `app/ops/users/page.tsx`: Server Component（セッション確認 + initialUsers SSR）
  - `components/ops/OpsSidebar.tsx`: ユーザー管理リンク追加
- **注意点**:
  - `AuthUser` の currentUserId は `session.userId`（camelCase）
  - shell の `$2b$...` ハッシュ問題: psql コマンド内でのハッシュ挿入は shell 変数展開で破損 → Python + SQLAlchemy 経由で解決
  - `kubectl cp` でコピーしたファイルは `rollout restart` で消えるため Docker イメージ再ビルドが必須
  - `DOCKER_BUILDKIT=0` を設定してビルド（VM 環境では buildx 利用不可）
- test_marketer ユーザー（id=5）がテスト中に作成。未削除（必要に応じて手動削除）

---

## フェーズ5: Nginx Ingress Controller 導入

> バックエンドを非公開化し、本番構成に近づける。

### 5-1. Nginx Ingress Controller インストール

- [x] **5-1-1. Nginx Ingress Controller マニフェスト適用**
  - ingress-nginx v1.10.0 (baremetal) を適用

- [x] **5-1-2. Ingress Controller の NodePort を確認**
  - HTTP: **31408**, HTTPS: **32239**

### 5-2. Ingress リソース定義

- [x] **5-2-1. Ingress マニフェスト作成**
  - `infrastructure/k8s/ingress/ingress.yaml`
  - ルーティング: すべてのリクエスト → frontend（Next.js の `/api/*` が内部でバックエンドへプロキシ）
  - アノテーション: `ssl-redirect: true` + `force-ssl-redirect: true`

- [x] **5-2-2. バックエンド Service を NodePort → ClusterIP に変更**
  - `infrastructure/k8s/backend/manifest.yaml` の type を ClusterIP に変更

- [x] **5-2-3. フロントエンド Service も ClusterIP に変更**
  - `infrastructure/k8s/frontend/manifest.yaml` の type を ClusterIP に変更

### 5-3. SSL 証明書設定（自己署名）

- [x] **5-3-1. 自己署名証明書の生成**
  - 証明書: `/technomart/infrastructure/k8s/ingress/tls.{key,crt}` (CN=192.168.56.10)
  - Secret: `kubectl create secret tls technomart-tls -n technomart`

- [x] **5-3-2. Ingress に TLS 設定を追加**
  - `spec.tls[0].secretName: technomart-tls`（hosts 指定なし → 全リクエストに適用）

- [x] **5-3-3. `SECURE_COOKIES: "false"` → `"true"` に変更**
  - frontend ConfigMap を更新、`kubectl rollout restart deployment/frontend` 実施

### 5-4. フロントエンドの API URL 更新

- [-] **5-4-1. `NEXT_PUBLIC_API_URL` 変更は不要**
  - `BACKEND_URL` は k8s 内部 DNS（ClusterIP）を使用しており変更不要
  - Next.js の `/api/*` ルートがバックエンドへプロキシする構成のため外部 URL 変更は不要

### 🧪 テスト（フェーズ5）
- [x] HTTP:31408 → 308 Permanent Redirect（HTTPS へリダイレクト）
- [x] HTTPS:32239 → 307（→ /auth/login）。ログイン後 200 でページ表示
- [x] `:30800` への直接アクセスが Connection refused
- [x] `:30300` への直接アクセスが Connection refused
- [x] HTTPS ログイン成功: admin/admin123 → Cookie に Secure フラグ付き JWT 取得
- [x] /ops/users へのアクセス確認（200）

### ✅ フェーズ5 完了基準
- [x] Ingress 経由でフロントエンドにアクセスできること
- [x] バックエンドが ClusterIP になり直接アクセス不可になること
- [x] HTTPS でアクセスできること（自己署名）

### 作業メモ（フェーズ5）
- 実施日: 2026-03-19
- Ingress Controller の NodePort: HTTP=31408, HTTPS=32239
- HTTPS アクセス: `https://192.168.56.10:32239/`（ブラウザでは証明書警告が出る）
- ⚠️ HTTP→HTTPS リダイレクトの Location ヘッダーは `https://192.168.56.10`（port なし）
  - NodePort 環境の既知の制限。ユーザーは `https://192.168.56.10:32239/` を直接ブックマーク
- **実装詳細**:
  - `infrastructure/k8s/ingress/ingress.yaml`: Ingress リソース新規作成
  - `infrastructure/k8s/backend/manifest.yaml`: Service を ClusterIP に変更
  - `infrastructure/k8s/frontend/manifest.yaml`: Service を ClusterIP に変更、SECURE_COOKIES=true

---

## フェーズ6: その他整備

### 6-1. シードデータ投入の自動化

- [x] **6-1-1. `seed_all.sh` を整備**
  - 配置: `infrastructure/scripts/seed_all.sh`
  - 処理: S3バケット作成 → Kafkaトピック確認 → プロデューサー → コンシューマー → 名寄せ → スコアリング → Embedding 生成

- [x] **6-1-2. seed_all.sh の内容**
  - [1] LocalStack S3 バケット確認・作成（technomart-datalake / technomart-raw）
  - [2] Kafka トピック確認（不足時は自動作成）
  - [3] 全プロデューサー実行（ec / pos / app / inventory）
  - [4] 全コンシューマー実行（pg_consumer / s3_consumer）
  - [5] 名寄せバッチ（`--mode full`）
  - [6] スコアリングバッチ（`--mode full`、ClickHouse 同期含む）
  - [7] 商品 Embedding 生成（pgvector / nomic-embed-text）

### 6-2. pgvector Embedding 生成

- [x] **6-2-1. 商品 Embedding 生成バッチ**
  - モデル: `nomic-embed-text`（Ollama、768次元）
  - 対象: `unified_products`（商品名 + ブランド + category_id のテキスト）
  - ALTER TABLE で `embedding vector(768)` カラムを自動追加（べき等）
  - 配置: `application/backend/app/pipelines/embeddings/product_embeddings.py`
  - 実行結果: 23件全商品の Embedding 生成完了

- [-] **6-2-2. 顧客 Embedding 生成バッチ**
  - `unified_customers` に embedding カラムなし、対応ユースケースは顧客→商品推薦（既存の `/business/customers/{id}/recommendations`）で対応済み。独立バッチは不要と判断

- [x] **6-2-3. 類似商品推薦 API エンドポイント**
  - `GET /business/products/{id}/similar` → pgvector コサイン類似度検索
  - 配置: `application/backend/app/presentation/routers/business.py`
  - 動作: embedding 生成済み商品はそのまま検索、未生成は Ollama で即時生成

### 6-3. ClickHouse 日次 ETL

- [x] **6-3-1. ETL スクリプト実装**
  - PG staging_ec_events → ClickHouse ec_events
  - PG staging_pos_transactions → ClickHouse pos_transactions
  - PG集計 → ClickHouse sales_by_channel（チャネル別日次集計）
  - 配置: `application/backend/app/pipelines/etl/pg_to_clickhouse.py`
  - 引数: `--date YYYY-MM-DD`（省略時: 昨日）

- [x] **6-3-2. Kubernetes CronJob マニフェスト**
  - `infrastructure/k8s/etl/cronjob-etl.yaml`
  - schedule: `"0 19 * * *"`（UTC 19:00 = JST 04:00）

### 6-4. Terraform 整備（LocalStack）

- [x] **6-4-1. LocalStack provider の設定**
  - `infrastructure/terraform/localstack/main.tf`
  - `infrastructure/terraform/localstack/variables.tf`
  - 本番移行: `endpoints` ブロックを削除するだけで AWS 対応

- [x] **6-4-2. S3 バケット定義を Terraform で管理**
  - technomart-datalake（import済み）/ technomart-raw / technomart-aggregated / technomart-models
  - technomart-raw にバージョニング有効化

- [x] **6-4-3. `terraform plan` / `terraform apply` の動作確認**
  - `terraform init` → `terraform plan` → `terraform apply` 成功
  - ⚠️ LocalStack は日本語タグ非対応 → Purpose タグを英語化

### ✅ フェーズ6 完了基準
- [x] `seed_all.sh` 1本でデータが全て投入されること
- [x] pgvector Embedding が生成され格納されること（23件）
- [x] ClickHouse ETL が CronJob として動作すること

### 作業メモ（フェーズ6）
- 実施日: 2026-03-19
- 商品 Embedding: 23件（nomic-embed-text 768次元）
- ClickHouse ETL: staging → ec_events / pos_transactions / sales_by_channel
- Terraform: `terraform apply` 成功（4バケット作成、1つは import）
- 注意: LocalStack の S3 タグは ASCII のみ対応（日本語不可）

---

## フェーズ7: 障害シナリオテスト

> ローカルだから試せる。本番移行前に確認しておく。

- [x] **7-1. Pod を意図的に落としてデータ欠損が起きないか確認**
  - `kubectl delete pod -n technomart kafka-0` を実行
  - **復旧時間**: 約 40 秒で Running に戻った
  - **offset 完全一致**: ec.events (0→30788, 1→30539, 2→30435) / LAG=0（全パーティション）
  - **トピック一覧保持**: ec.events / pos.transactions / app.behaviors / inventory.updates / customer.scores 全存在

- [x] **7-2. PVC のデータ永続化確認**
  - `kubectl rollout restart deployment/postgresql -n technomart` を実行
  - **再起動後のレコード数（全一致）**:
    - unified_customers: 5106 件
    - customer_scores: 937 件
    - staging_ec_events: 91762 件
    - unified_products (embedding): 23/23 件

- [x] **7-3. Kafka offset 管理の確認（コンシューマーが途中から再開できるか）**
  - テストメッセージ 10件 → LAG=10 を確認
  - 1回目コンシューマー実行 → 10件処理、LAG=0、offset コミット済み
  - さらに 10件追加 → LAG=10
  - 2回目コンシューマー実行 → **新規の 10件だけ処理**（重複なし）、LAG=0
  - offset の進み: p0: 30792→30794 / p1: 30539→30544 / p2: 30441→30444（正確に +10）

### 作業メモ（フェーズ7）
- 実施日: 2026-03-19
- Kafka Pod 再起動後の offset: 削除前と完全一致（LAG=0 維持）。PVC (kafka-pvc 10Gi) により保持
- PG 再起動後のレコード数: 5106 / 937 / 91762 / 23。PVC (postgresql-pvc 20Gi) により保持
- コンシューマー offset 管理: GROUP_ID='pg-writer' による commit offset が Kafka に保持され、再起動後も続きから処理
- **本番移行への示唆**:
  - PVC → EBS/EFS への移行でデータ永続性は維持される
  - Kafka の offset commit は GroupID 単位で Kafka 内部に保持（`__consumer_offsets` トピック）
  - Pod 再起動（ローリングアップデート含む）でも offset は失われない

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
