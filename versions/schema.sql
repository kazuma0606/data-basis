-- テクノマート デプロイバージョン管理 DB スキーマ
-- SQLite3
-- 初期化: sqlite3 versions/deployments.db < versions/schema.sql

-- デプロイ履歴（全件保持・削除しない）
CREATE TABLE IF NOT EXISTS deployments (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    deployed_at   TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
    environment   TEXT    NOT NULL CHECK (environment IN ('prod', 'dev')),
    service       TEXT    NOT NULL,   -- 'backend' | 'frontend' | 'toolbox' | 'all'
    semver        TEXT    NOT NULL,   -- 例: v1.0.1
    git_hash      TEXT    NOT NULL,   -- 例: a3f9c12
    git_branch    TEXT,               -- 例: main | feature/kafka-pipeline
    image_ref     TEXT    NOT NULL,   -- 例: localhost:5000/technomart-backend:v1.0.1-a3f9c12
    status        TEXT    NOT NULL DEFAULT 'success'
                          CHECK (status IN ('success', 'failed', 'rolled_back')),
    notes         TEXT                -- 任意メモ
);

-- 現在の状態（environment + service の組み合わせごとに最新1件）
CREATE TABLE IF NOT EXISTS current_state (
    environment   TEXT    NOT NULL,
    service       TEXT    NOT NULL,
    semver        TEXT    NOT NULL,
    git_hash      TEXT    NOT NULL,
    image_ref     TEXT    NOT NULL,
    deployed_at   TEXT    NOT NULL,
    PRIMARY KEY (environment, service)
);

-- 確認用ビュー
CREATE VIEW IF NOT EXISTS v_current AS
SELECT
    environment,
    service,
    semver,
    git_hash,
    image_ref,
    deployed_at
FROM current_state
ORDER BY environment, service;

CREATE VIEW IF NOT EXISTS v_history AS
SELECT
    id,
    deployed_at,
    environment,
    service,
    semver,
    git_hash,
    status,
    notes
FROM deployments
ORDER BY id DESC;
