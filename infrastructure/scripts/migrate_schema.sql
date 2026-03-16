-- スキーマ移行: データパイプライン形式 → バックエンドモデル形式
-- unified_customers: UUID id → INTEGER unified_id
-- churn_labels: UUID unified_id → INTEGER unified_id

BEGIN;

-- ── unified_customers に unified_id (serial int) を追加 ──────────────────

-- serial カラムを追加（auto-increment）
ALTER TABLE unified_customers ADD COLUMN IF NOT EXISTS unified_id SERIAL;

-- バックエンドが期待するカラムを追加
ALTER TABLE unified_customers ADD COLUMN IF NOT EXISTS name_kanji  VARCHAR(100);
ALTER TABLE unified_customers ADD COLUMN IF NOT EXISTS name_kana   VARCHAR(100);
ALTER TABLE unified_customers ADD COLUMN IF NOT EXISTS resolution_score FLOAT;

-- canonical_name → name_kanji にコピー
UPDATE unified_customers SET name_kanji = canonical_name WHERE name_kanji IS NULL;

-- unified_id に unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_unified_customers_unified_id
  ON unified_customers(unified_id);

-- ── churn_labels を integer unified_id に移行 ────────────────────────────

-- 一時テーブルに退避
CREATE TEMP TABLE churn_labels_tmp AS
  SELECT
    uc.unified_id AS unified_id_int,
    cl.label,
    cl.updated_at
  FROM churn_labels cl
  JOIN unified_customers uc ON uc.id = cl.unified_id;

-- 古いテーブルを削除して新しい定義で作り直す
DROP TABLE churn_labels;

CREATE TABLE churn_labels (
    unified_id          INTEGER PRIMARY KEY,
    label               VARCHAR(20) NOT NULL,
    last_purchase_at    TIMESTAMP,
    days_since_purchase INTEGER,
    updated_at          TIMESTAMP NOT NULL
);

-- 退避データを挿入
INSERT INTO churn_labels (unified_id, label, updated_at)
SELECT unified_id_int, label, updated_at FROM churn_labels_tmp;

-- ── customer_scores は既存のまま INTEGER unified_id で OK ─────────────────
-- (バックエンドモデル通りのはず)

-- ── unified_products: 確認のみ ─────────────────────────────────────────────

COMMIT;

\echo 'Migration completed successfully.'
