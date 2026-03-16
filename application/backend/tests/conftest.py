import os

# テスト実行前に必要な環境変数を設定する
# .env が存在しない環境でも動作するように setdefault を使用
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-testing-only-do-not-use-in-production")
os.environ.setdefault("POSTGRES_PASSWORD", "technomart")
os.environ.setdefault("CLICKHOUSE_PASSWORD", "technomart")
