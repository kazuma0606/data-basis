from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request

from app.domain.entities.user import AuthUser
from app.domain.exceptions import ForbiddenError, UnauthorizedError
from app.config import settings
from app.infrastructure.clients.kafka_admin_client import KafkaAdminClientImpl
from app.infrastructure.clients.ollama_client import OllamaClient
from app.infrastructure.database.clickhouse import ch_query
from app.infrastructure.database.postgres import async_session_factory, get_db
from app.infrastructure.database.redis import get_redis
from app.infrastructure.repositories.clickhouse_analytics_repository import ClickHouseAnalyticsRepository
from app.infrastructure.repositories.postgres_customer_repository import PostgresCustomerRepository
from app.infrastructure.repositories.postgres_job_repository import PostgresJobRepository
from app.infrastructure.repositories.postgres_product_repository import PostgresProductRepository
from app.infrastructure.repositories.postgres_schema_repository import PostgresSchemaRepository
from app.infrastructure.repositories.postgres_user_repository import PostgresUserRepository
from app.interfaces.clients.kafka_client import IKafkaAdminClient
from app.interfaces.clients.llm_client import ILLMClient
from app.interfaces.repositories.analytics_repository import IAnalyticsRepository
from app.interfaces.repositories.customer_repository import ICustomerRepository
from app.interfaces.repositories.job_repository import IJobRepository
from app.interfaces.repositories.product_repository import IProductRepository
from app.interfaces.repositories.schema_repository import ISchemaRepository
from app.interfaces.repositories.user_repository import IUserRepository
from app.use_cases.auth.login import LoginUseCase
from app.use_cases.ops.health_check import HealthCheckUseCase


# ── リポジトリ ────────────────────────────────────────────
def get_user_repository(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> IUserRepository:
    return PostgresUserRepository(db)


# ── ユースケース ───────────────────────────────────────────
def get_login_use_case(
    repo: Annotated[IUserRepository, Depends(get_user_repository)],
) -> LoginUseCase:
    return LoginUseCase(repo)


# ── Ops: Kafka ────────────────────────────────────────────
def get_kafka_admin_client() -> IKafkaAdminClient:
    return KafkaAdminClientImpl(settings.kafka_bootstrap_servers)


# ── Ops: ジョブ・スキーマリポジトリ ──────────────────────
def get_job_repository(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> IJobRepository:
    return PostgresJobRepository(db)


def get_schema_repository(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ISchemaRepository:
    return PostgresSchemaRepository(db)


# ── Ops: ヘルスチェック ────────────────────────────────────
def get_health_check_use_case(
    kafka: Annotated[IKafkaAdminClient, Depends(get_kafka_admin_client)],
) -> HealthCheckUseCase:
    async def check_postgresql() -> None:
        async with async_session_factory() as session:
            from sqlalchemy import text
            await session.execute(text("SELECT 1"))

    async def check_clickhouse() -> None:
        await ch_query("SELECT 1")

    async def check_kafka() -> None:
        await kafka.list_topics()

    async def check_redis() -> None:
        redis = get_redis()
        await redis.ping()

    async def check_ollama() -> None:
        import httpx
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{settings.ollama_base_url}/api/tags")
            resp.raise_for_status()

    return HealthCheckUseCase({
        "postgresql": check_postgresql,
        "clickhouse": check_clickhouse,
        "kafka": check_kafka,
        "redis": check_redis,
        "ollama": check_ollama,
    })


# ── Business: 顧客・分析・LLM ─────────────────────────────

def get_customer_repository(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ICustomerRepository:
    return PostgresCustomerRepository(db)


def get_analytics_repository() -> IAnalyticsRepository:
    return ClickHouseAnalyticsRepository()


def get_product_repository(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> IProductRepository:
    return PostgresProductRepository(db)


def get_llm_client() -> ILLMClient:
    return OllamaClient()


# ── 認証・認可 ────────────────────────────────────────────
def get_current_user(request: Request) -> AuthUser:
    user: AuthUser | None = getattr(request.state, "current_user", None)
    if user is None:
        raise UnauthorizedError()
    return user


def require_ops_role(
    current_user: Annotated[AuthUser, Depends(get_current_user)],
) -> AuthUser:
    if not current_user.role.can_access_ops():
        raise ForbiddenError()
    return current_user


def require_business_role(
    current_user: Annotated[AuthUser, Depends(get_current_user)],
) -> AuthUser:
    if not current_user.role.can_access_business():
        raise ForbiddenError()
    return current_user
