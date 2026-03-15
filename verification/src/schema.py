SCHEMA = """
PRAGMA foreign_keys = ON;

-- ────────────────────────────────────────────
-- マスタ（基幹システム = 正マスタ）
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS master_categories (
    category_id   INTEGER PRIMARY KEY,
    parent_id     INTEGER REFERENCES master_categories(category_id),
    level         INTEGER NOT NULL,   -- 1=大カテゴリ, 2=中カテゴリ
    name          TEXT    NOT NULL,
    name_en       TEXT
);

CREATE TABLE IF NOT EXISTS master_products (
    product_id    INTEGER PRIMARY KEY,
    category_id   INTEGER NOT NULL REFERENCES master_categories(category_id),
    name          TEXT    NOT NULL,
    brand         TEXT,
    price         INTEGER NOT NULL,
    is_active     INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS master_stores (
    store_id      INTEGER PRIMARY KEY,
    name          TEXT NOT NULL,
    prefecture    TEXT NOT NULL,
    city          TEXT
);

-- ────────────────────────────────────────────
-- ECシステム（MySQL相当, 2015年構築）
-- 汚れ: メールの古さ / 電話フォーマット / 都道府県表記 / 退会漏れ
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ec_customers (
    ec_user_id    INTEGER PRIMARY KEY,
    email         TEXT,
    name_kanji    TEXT,
    name_kana     TEXT,
    birth_date    TEXT,           -- 西暦 YYYY-MM-DD
    phone         TEXT,           -- フォーマット不統一
    prefecture    TEXT,           -- 「東京都」「東京」「13」混在
    registered_at TEXT,
    last_login_at TEXT,
    is_deleted    INTEGER DEFAULT 0  -- 退会漏れで0のまま残存するケースあり
);

CREATE TABLE IF NOT EXISTS ec_products (
    ec_product_id    INTEGER PRIMARY KEY,
    ec_product_code  TEXT UNIQUE,       -- 独自コード体系 EC####
    master_product_id INTEGER,
    name             TEXT NOT NULL,
    category_name    TEXT,              -- カテゴリIDでなく名称文字列で持っている
    price            INTEGER
);

CREATE TABLE IF NOT EXISTS ec_orders (
    order_id      INTEGER PRIMARY KEY,
    ec_user_id    INTEGER,
    ordered_at    TEXT,
    total_amount  INTEGER,
    status        TEXT    -- completed / cancelled / returned
);

CREATE TABLE IF NOT EXISTS ec_order_items (
    order_item_id INTEGER PRIMARY KEY,
    order_id      INTEGER,
    ec_product_id INTEGER,
    quantity      INTEGER,
    unit_price    INTEGER
);

CREATE TABLE IF NOT EXISTS ec_browsing_events (
    event_id      INTEGER PRIMARY KEY,
    ec_user_id    INTEGER,
    session_id    TEXT,
    ec_product_id INTEGER,
    event_type    TEXT,   -- page_view / scroll_milestone / image_click / spec_expand / ...
    event_value   TEXT,
    timestamp     TEXT
);

-- ────────────────────────────────────────────
-- POSシステム（SQL Server相当, 2008年導入）
-- 汚れ: カナのみ / 和暦 / 電話フォーマット / スキーマ変更不可
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pos_members (
    member_id     INTEGER PRIMARY KEY,
    name_kana     TEXT,           -- カナのみ、漢字なし
    birth_date_jp TEXT,           -- 和暦文字列 例: S55, H15, R3
    phone         TEXT,
    registered_at TEXT
);

CREATE TABLE IF NOT EXISTS pos_products (
    pos_product_id   INTEGER PRIMARY KEY,
    pos_product_code TEXT UNIQUE, -- 独自コード体系 POS-X####
    master_product_id INTEGER,
    name             TEXT,        -- 略称が多い
    price            INTEGER
);

CREATE TABLE IF NOT EXISTS pos_transactions (
    transaction_id INTEGER PRIMARY KEY,
    member_id      INTEGER,       -- 非会員はNULL
    store_id       INTEGER,
    transacted_at  TEXT,
    total_amount   INTEGER
);

CREATE TABLE IF NOT EXISTS pos_transaction_items (
    item_id        INTEGER PRIMARY KEY,
    transaction_id INTEGER,
    pos_product_id INTEGER,
    quantity       INTEGER,
    unit_price     INTEGER
);

CREATE TABLE IF NOT EXISTS pos_store_visits (
    visit_id      INTEGER PRIMARY KEY,
    member_id     INTEGER,
    store_id      INTEGER,
    visited_at    TEXT,
    duration_min  INTEGER
);

-- ────────────────────────────────────────────
-- 会員アプリ（PostgreSQL相当, 2021年構築）
-- 汚れ: UUIDベースのID / 電話番号がキー / 社内に権限なし
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_users (
    uid           TEXT PRIMARY KEY,  -- UUID
    phone         TEXT,              -- 名寄せのキー候補
    name          TEXT,
    registered_at TEXT,
    push_enabled  INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS app_events (
    event_id      INTEGER PRIMARY KEY,
    uid           TEXT,
    event_type    TEXT,
    event_value   TEXT,
    timestamp     TEXT
);

-- ────────────────────────────────────────────
-- 検証用グランドトゥルース（生成時のみ作成）
-- どのシステムIDが同一人物かを追跡するためのテーブル
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS _unified_links (
    true_person_id INTEGER,
    system         TEXT,   -- 'ec' / 'pos' / 'app'
    system_id      TEXT,   -- 各システムのID
    churn_status   TEXT    -- active / dormant / churned / dead
);
"""
