# データスキーマ設計

## 設計方針

- イベントは単体で記録し、集計・スコアリングは後処理で行う
- 生データは消さずにS3に全量保持（再処理可能にする）
- スコアリングはバッチ（日次・週次）を基本とする（フェーズ1）
- PostgreSQLは「現在の状態」、ClickHouseは「過去の全履歴の集計」

---

## テーブル層の全体像

```
① ソース層      各システムの生データをそのまま再現（汚れも含む）
② 統合層        名寄せ・クレンジング後のマスタ（PostgreSQL）
③ スコアリング層 潜在スコア・チャーン分類など（PostgreSQL + Redis）
④ 分析層        集計・分析用（ClickHouse）
```

---

## ① ソース層（Synthetic Dataで再現する既存システム）

### 商品・カテゴリマスタ（基幹システム = 正マスタ）

```sql
master_categories (
  category_id    SERIAL PRIMARY KEY,
  parent_id      INT REFERENCES master_categories(category_id),
  level          INT,        -- 1=大カテゴリ, 2=中, 3=小
  name           VARCHAR,
  name_en        VARCHAR     -- Embedding生成時に使用
)

-- 例
-- 大: 生活家電 / 調理家電 / 映像・音響 / PC・スマホ / 生活用品
-- 中: 冷蔵庫 / 洗濯機 / エアコン / 炊飯器 / テレビ / ...
-- 小: 縦型洗濯機 / ドラム式 / 40型以下テレビ / ...

master_products (
  product_id     SERIAL PRIMARY KEY,
  category_id    INT REFERENCES master_categories(category_id),
  name           VARCHAR,
  brand          VARCHAR,
  price          INT,
  release_date   DATE,
  is_active      BOOLEAN
)

master_stores (
  store_id       SERIAL PRIMARY KEY,
  name           VARCHAR,
  prefecture     VARCHAR,
  address        VARCHAR,
  opened_at      DATE
)

inventory (
  store_id       INT,
  product_id     INT,
  quantity       INT,
  updated_at     TIMESTAMP
)
```

### ECシステム（MySQL相当、2015年構築）

商品コードのプレフィックスが基幹と異なる（例: 基幹 `P-1042` → EC `EC1042`）。

```sql
ec_customers (
  ec_user_id     SERIAL PRIMARY KEY,
  email          VARCHAR,       -- バウンス・退会済みも残存
  name_kanji     VARCHAR,
  name_kana      VARCHAR,       -- 未入力も多い
  birth_date     DATE,          -- 西暦
  phone          VARCHAR,       -- フォーマット不統一
  address        VARCHAR,
  prefecture     VARCHAR,       -- 「東京都」「東京」「13」混在
  registered_at  TIMESTAMP,
  last_login_at  TIMESTAMP,
  is_deleted     BOOLEAN        -- 退会処理漏れでFALSEのまま残存あり
)

ec_products (
  ec_product_id  SERIAL PRIMARY KEY,
  ec_product_code VARCHAR,      -- 独自コード体系
  name           VARCHAR,
  category_name  VARCHAR,       -- カテゴリIDではなく名称文字列で持っている
  price          INT,
  is_active      BOOLEAN
)

ec_orders (
  order_id       SERIAL PRIMARY KEY,
  ec_user_id     INT,
  ordered_at     TIMESTAMP,
  total_amount   INT,
  status         VARCHAR        -- pending / completed / cancelled / returned
)

ec_order_items (
  order_item_id  SERIAL PRIMARY KEY,
  order_id       INT,
  ec_product_id  INT,
  quantity       INT,
  unit_price     INT
)

ec_browsing_events (
  event_id       BIGSERIAL PRIMARY KEY,
  ec_user_id     INT,
  session_id     VARCHAR,
  ec_product_id  INT,
  event_type     VARCHAR,   -- page_view / image_click / scroll_milestone /
                            --  spec_expand / review_read / cart_add /
                            --  wishlist_add / product_compare / search
  event_value    VARCHAR,   -- scroll_depthなら"75", image_clickなら"3"
  timestamp      TIMESTAMP
)

ec_cart_events (
  cart_event_id  SERIAL PRIMARY KEY,
  ec_user_id     INT,
  ec_product_id  INT,
  action         VARCHAR,   -- add / remove / checkout
  timestamp      TIMESTAMP
)
```

#### 行動イベント種別とシグナル強度

| event_type | シグナル強度 | 備考 |
|---|---|---|
| cart_add | 強 | 購買意欲が高い |
| wishlist_add | 強 | 明示的な興味 |
| product_compare | 強 | 比較検討中 |
| review_read | 中 | レビューセクションまでスクロール |
| spec_expand | 中 | スペック詳細を開いた |
| search | 中 | クエリワードをevent_valueに保持 |
| image_click | 中 | 何枚目をevent_valueに保持 |
| return_visit | 中 | 同一商品への再訪（session_idで判定） |
| scroll_depth | 弱 | 25/50/75/100%マイルストーン |
| page_view | 弱 | 単体ではほぼ雑音 |
| dwell_time | 弱 | 他シグナルと組み合わせて使う |

#### Synthetic Data生成パターン

| パターン | イベント組み合わせ |
|---|---|
| 興味あり | page_view + image_click複数 + spec_expand + return_visit |
| ながら見 | page_view + dwell_time長い + scroll_depth低い |
| 購買直前 | 興味ありパターン + cart_add → (購買 or 離脱) |

### POSシステム（SQL Server相当、2008年導入）

氏名はカナのみ、生年月日は和暦、商品コード体系がECと異なる（例: `POS-A1042`）。スキーマ変更はベンダー対応が必要なため柔軟性が低い。

```sql
pos_members (
  member_id      SERIAL PRIMARY KEY,
  name_kana      VARCHAR,       -- カナのみ、漢字なし
  birth_date_jp  VARCHAR,       -- 和暦文字列（例: "S55"）
  phone          VARCHAR,       -- 主キーに近い役割だが重複あり
  registered_at  TIMESTAMP
)

pos_products (
  pos_product_id   SERIAL PRIMARY KEY,
  pos_product_code VARCHAR,     -- 独自コード体系
  name             VARCHAR,     -- 略称が多い
  price            INT
)

pos_transactions (
  transaction_id SERIAL PRIMARY KEY,
  member_id      INT,           -- 非会員購買はNULL
  store_id       INT,
  transacted_at  TIMESTAMP,
  total_amount   INT
)

pos_transaction_items (
  item_id          SERIAL PRIMARY KEY,
  transaction_id   INT,
  pos_product_id   INT,
  quantity         INT,
  unit_price       INT
)

pos_store_visits (
  visit_id       SERIAL PRIMARY KEY,
  member_id      INT,
  store_id       INT,
  visited_at     TIMESTAMP,
  duration_min   INT            -- 滞在時間（分）、POSゲートで計測
)
```

### 会員アプリ（PostgreSQL相当、2021年構築）

電話番号ベースのID体系。アプリ会社が管理しており、社内に権限なし。

```sql
app_users (
  uid            VARCHAR PRIMARY KEY,  -- UUIDベース
  phone          VARCHAR,              -- 名寄せのキー候補
  name           VARCHAR,
  registered_at  TIMESTAMP,
  push_enabled   BOOLEAN
)

app_events (
  event_id       BIGSERIAL PRIMARY KEY,
  uid            VARCHAR,
  event_type     VARCHAR,   -- app_open / category_browse / product_view /
                            --  notification_open / search / store_map_view
  event_value    VARCHAR,
  timestamp      TIMESTAMP
)

app_push_settings (
  uid            VARCHAR PRIMARY KEY,
  sale_notify    BOOLEAN,
  restock_notify BOOLEAN,
  recommend_notify BOOLEAN,
  updated_at     TIMESTAMP
)
```

---

## ② 統合層（PostgreSQL）

名寄せ・クレンジング後の統合マスタ。データ基盤の中核。

```sql
unified_customers (
  unified_id         SERIAL PRIMARY KEY,
  name_kanji         VARCHAR,
  name_kana          VARCHAR,
  email              VARCHAR,
  phone              VARCHAR,       -- 正規化済み（E.164形式）
  birth_date         DATE,          -- 西暦に統一
  prefecture         VARCHAR,       -- 正規化済み
  resolution_score   FLOAT,         -- 名寄せ信頼度（0〜1）
  created_at         TIMESTAMP,
  updated_at         TIMESTAMP
)

customer_id_map (
  unified_id         INT,
  source_system      VARCHAR,       -- 'ec' / 'pos' / 'app'
  source_id          VARCHAR,       -- 各システムのID
  matched_at         TIMESTAMP,
  match_method       VARCHAR        -- 'email' / 'phone' / 'name+birth' / 'manual'
)

unified_products (
  unified_product_id SERIAL PRIMARY KEY,
  category_id        INT,           -- master_categoriesを参照
  name               VARCHAR,
  brand              VARCHAR,
  price              INT,
  embedding          VECTOR(768)    -- pgvector（nomic-embed-textで生成）
)

product_id_map (
  unified_product_id INT,
  source_system      VARCHAR,       -- 'ec' / 'pos' / 'master'
  source_code        VARCHAR        -- 各システムの商品コード
)
```

---

## ③ スコアリング層（PostgreSQL + Redis）

```sql
-- PostgreSQL: バッチ更新されるスコア
customer_scores (
  unified_id         INT,
  category_id        INT,
  affinity_score     FLOAT,         -- カテゴリ親和性（0〜100）
  churn_risk_score   FLOAT,         -- チャーンリスク（0〜1）
  visit_predict_score FLOAT,        -- 来店予測（0〜1）
  timing_score       FLOAT,         -- 購買タイミングスコア
  updated_at         TIMESTAMP,
  batch_run_date     DATE
)

customer_signals (
  signal_id          BIGSERIAL PRIMARY KEY,
  unified_id         INT,
  category_id        INT,
  signal_type        VARCHAR,       -- イベント種別
  signal_value       FLOAT,         -- スコア加算値
  source_event_id    VARCHAR,       -- 元イベントID（トレーサビリティ）
  occurred_at        TIMESTAMP
)

churn_labels (
  unified_id         INT PRIMARY KEY,
  label              VARCHAR,       -- 'active' / 'dormant' / 'churned'
  last_purchase_at   TIMESTAMP,
  days_since_purchase INT,
  updated_at         TIMESTAMP
)
```

```
# Redis: リアルタイムキャッシュ
customer:score:{unified_id}:category:{category_id}  → affinity_score
customer:churn:{unified_id}                          → label
TTL: 24時間（日次バッチで更新）
```

#### スコアリング更新頻度

| スコア種別 | 更新頻度 | 用途 |
|---|---|---|
| カテゴリ親和性スコア | 日次バッチ | 「これも気になりませんか」サジェスト |
| チャーンリスクスコア | 週次バッチ | 「久しぶりにいかがですか」キャンペーン |
| 購買タイミングスコア | 週次バッチ | 「買い替え時期では？」サジェスト |
| 来店予測スコア | 週次バッチ | 店舗スタッフ配置・在庫最適化 |

---

## ④ 分析層（ClickHouse）

マーケ・店長・データサイエンティストが使うBI/ダッシュボード専用。
S3から定期ロード（日次）。個別レコードの参照はしない。

```sql
sales_by_channel (
  date           DATE,
  channel        VARCHAR,       -- 'ec' / 'store'
  store_id       INT,
  category_id    INT,
  total_amount   Int64,
  order_count    Int64,
  customer_count Int64
)
-- 用途: チャネル別・カテゴリ別売上のダッシュボード

customer_behavior_daily (
  date           DATE,
  unified_id     Int64,
  channel        VARCHAR,
  page_views     Int32,
  cart_adds      Int32,
  purchases      Int32,
  total_spent    Int64
)
-- 用途: 顧客行動サマリ、コホート分析

category_affinity_summary (
  week           Date,
  category_id    Int32,
  age_group      VARCHAR,       -- '20s' / '30s' / '40s' / '50s+'
  gender         VARCHAR,
  avg_score      Float32,
  customer_count Int64
)
-- 用途: どの属性がどのカテゴリに親和性が高いかの把握

churn_summary_weekly (
  week           Date,
  label          VARCHAR,
  customer_count Int64,
  avg_days_since_purchase Float32
)
-- 用途: チャーン状況のトレンド把握
```

---

## PostgreSQL vs ClickHouse の境界まとめ

| | PostgreSQL | ClickHouse |
|---|---|---|
| 格納するもの | 現在の状態・個別レコード | 過去の全履歴・集計結果 |
| クエリの性質 | 個別顧客の参照・更新 | 大量データの集計・分析 |
| 使う人 | アプリ・APIサーバー | マーケ・店長・DS |
| 更新頻度 | リアルタイム〜日次 | 日次ロード |
| 例 | 「田中さんのスコアは？」 | 「40代男性の購買傾向は？」 |

---

## Kafkaトピックとテーブルの対応

| Kafkaトピック | 生産者 | 流れ先 | 対応テーブル |
|---|---|---|---|
| ec.events | ECシステム | S3 + スコアリング | ec_browsing_events |
| ec.orders | ECシステム | S3 + PostgreSQL | ec_orders / ec_order_items |
| pos.transactions | POSシステム | S3 + PostgreSQL | pos_transactions |
| pos.visits | POSシステム | S3 + スコアリング | pos_store_visits |
| app.behaviors | 会員アプリ | S3 + スコアリング | app_events |
| inventory.updates | 基幹システム | S3 + PostgreSQL | inventory |
| customer.scores | スコアリングサービス | Redis + PostgreSQL | customer_scores |
