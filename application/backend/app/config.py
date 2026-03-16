from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # ── PostgreSQL ────────────────────────────────────────
    postgres_host: str = "127.0.0.1"
    postgres_port: int = 32432
    postgres_db: str = "technomart"
    postgres_user: str = "technomart"
    postgres_password: str = ""

    # ── ClickHouse ────────────────────────────────────────
    clickhouse_host: str = "127.0.0.1"
    clickhouse_port: int = 30823
    clickhouse_db: str = "technomart"
    clickhouse_user: str = "technomart"
    clickhouse_password: str = ""

    # ── Redis ─────────────────────────────────────────────
    redis_url: str = "redis://127.0.0.1:32379/0"

    # ── Kafka ─────────────────────────────────────────────
    kafka_bootstrap_servers: str = "127.0.0.1:32092"

    # ── Ollama ────────────────────────────────────────────
    ollama_base_url: str = "http://127.0.0.1:31434"

    # ── LocalStack S3 ─────────────────────────────────────
    s3_endpoint_url: str = "http://127.0.0.1:31566"
    s3_bucket: str = "technomart-datalake"
    aws_access_key_id: str = "test"
    aws_secret_access_key: str = "test"
    aws_default_region: str = "ap-northeast-1"

    # ── JWT ───────────────────────────────────────────────
    jwt_secret_key: str = ""
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 480

    @property
    def postgres_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )


settings = Settings()
