-- テクノマート バックエンド スキーマ初期化
-- 使い方: psql -h 127.0.0.1 -p 32432 -U technomart -d technomart -f create_tables.sql

CREATE TABLE IF NOT EXISTS users (
    id               SERIAL PRIMARY KEY,
    username         VARCHAR(100) UNIQUE NOT NULL,
    hashed_password  VARCHAR(255) NOT NULL,
    role             VARCHAR(50) NOT NULL,
    store_id         INTEGER
);

CREATE TABLE IF NOT EXISTS pipeline_jobs (
    id                 SERIAL PRIMARY KEY,
    job_name           VARCHAR(100) NOT NULL,
    status             VARCHAR(20) NOT NULL,
    started_at         TIMESTAMP NOT NULL,
    finished_at        TIMESTAMP,
    records_processed  INTEGER,
    error_message      TEXT
);

CREATE TABLE IF NOT EXISTS scoring_batches (
    id                 SERIAL PRIMARY KEY,
    batch_type         VARCHAR(50) NOT NULL,
    status             VARCHAR(20) NOT NULL,
    started_at         TIMESTAMP NOT NULL,
    finished_at        TIMESTAMP,
    records_processed  INTEGER,
    next_run_at        TIMESTAMP
);

CREATE TABLE IF NOT EXISTS unified_customers (
    unified_id        SERIAL PRIMARY KEY,
    name_kanji        VARCHAR(100),
    name_kana         VARCHAR(100),
    email             VARCHAR(255),
    phone             VARCHAR(20),
    birth_date        DATE,
    prefecture        VARCHAR(10),
    resolution_score  FLOAT,
    created_at        TIMESTAMP NOT NULL,
    updated_at        TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS customer_id_map (
    id             SERIAL PRIMARY KEY,
    unified_id     INTEGER NOT NULL,
    source_system  VARCHAR(10) NOT NULL,
    source_id      VARCHAR(100) NOT NULL,
    match_method   VARCHAR(20),
    matched_at     TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_customer_id_map_unified_id ON customer_id_map(unified_id);

CREATE TABLE IF NOT EXISTS unified_products (
    unified_product_id  SERIAL PRIMARY KEY,
    category_id         INTEGER,
    name                VARCHAR(255) NOT NULL,
    brand               VARCHAR(100),
    price               INTEGER
);

CREATE TABLE IF NOT EXISTS churn_labels (
    unified_id          INTEGER PRIMARY KEY,
    label               VARCHAR(20) NOT NULL,
    last_purchase_at    TIMESTAMP,
    days_since_purchase INTEGER,
    updated_at          TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS customer_scores (
    id                  SERIAL PRIMARY KEY,
    unified_id          INTEGER NOT NULL,
    category_id         INTEGER NOT NULL,
    affinity_score      FLOAT NOT NULL,
    churn_risk_score    FLOAT NOT NULL,
    visit_predict_score FLOAT NOT NULL,
    timing_score        FLOAT NOT NULL,
    updated_at          TIMESTAMP NOT NULL,
    batch_run_date      DATE
);

CREATE INDEX IF NOT EXISTS idx_customer_scores_unified_id ON customer_scores(unified_id);

\echo 'Schema created successfully.'
