from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from app.dependencies import (
    get_health_check_use_case,
    get_job_repository,
    get_kafka_admin_client,
    get_schema_repository,
)
from app.interfaces.clients.kafka_client import KafkaConsumerGroup, KafkaTopic
from app.interfaces.repositories.job_repository import PipelineJob, ScoringBatch
from app.interfaces.repositories.schema_repository import ColumnInfo, TableSchema
from app.main import app
from app.use_cases.ops.health_check import HealthCheckUseCase

_NOW = datetime(2026, 3, 16, 0, 0, 0)


# ── Fake 実装 ─────────────────────────────────────────────
class FakeKafkaClient:
    async def list_topics(self) -> list[KafkaTopic]:
        return [KafkaTopic(name="ec.events", partitions=3, message_count=43707)]

    async def list_consumer_groups(self) -> list[KafkaConsumerGroup]:
        return [KafkaConsumerGroup(group_id="test-group", state="stable")]

    async def close(self) -> None:
        pass


class FakeJobRepository:
    async def list_pipeline_jobs(self, limit: int = 20) -> list[PipelineJob]:
        return [PipelineJob(1, "generate_csv", "success", _NOW, _NOW, 5000, None)]

    async def list_scoring_batches(self, limit: int = 20) -> list[ScoringBatch]:
        return [ScoringBatch(1, "churn_risk", "success", _NOW, _NOW, 5000, None)]


class FakeSchemaRepository:
    async def list_tables(self, schema: str = "public") -> list[TableSchema]:
        return [TableSchema("unified_customers", [ColumnInfo("id", "integer", False, None)])]


def _fake_health_use_case() -> HealthCheckUseCase:
    async def _ok() -> None:
        pass

    return HealthCheckUseCase(
        {"postgresql": _ok, "clickhouse": _ok, "kafka": _ok, "redis": _ok, "ollama": _ok}
    )


@pytest.fixture
def engineer_token(client: TestClient) -> str:
    resp = client.post("/auth/login", json={"username": "engineer", "password": "engineer123"})
    return resp.json()["access_token"]


@pytest.fixture
def marketer_token(client: TestClient) -> str:
    resp = client.post("/auth/login", json={"username": "marketer", "password": "marketer123"})
    return resp.json()["access_token"]


@pytest.fixture
def client() -> TestClient:
    from app.dependencies import get_user_repository
    from tests.e2e.conftest import FakeUserRepository

    app.dependency_overrides[get_user_repository] = lambda: FakeUserRepository()
    app.dependency_overrides[get_kafka_admin_client] = lambda: FakeKafkaClient()
    app.dependency_overrides[get_job_repository] = lambda: FakeJobRepository()
    app.dependency_overrides[get_schema_repository] = lambda: FakeSchemaRepository()
    app.dependency_overrides[get_health_check_use_case] = _fake_health_use_case

    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ── engineer は全エンドポイントに 200 ────────────────────
@pytest.mark.parametrize(
    "path",
    [
        "/ops/health",
        "/ops/kafka/topics",
        "/ops/kafka/consumer-groups",
        "/ops/pipeline/jobs",
        "/ops/scoring/batches",
        "/ops/schema/tables",
    ],
)
def test_engineer_can_access_ops(client: TestClient, engineer_token: str, path: str) -> None:
    resp = client.get(path, headers={"Authorization": f"Bearer {engineer_token}"})
    assert resp.status_code == 200


# ── marketer は全エンドポイントに 403 ────────────────────
@pytest.mark.parametrize(
    "path",
    [
        "/ops/health",
        "/ops/kafka/topics",
        "/ops/kafka/consumer-groups",
        "/ops/pipeline/jobs",
        "/ops/scoring/batches",
        "/ops/schema/tables",
    ],
)
def test_marketer_cannot_access_ops(client: TestClient, marketer_token: str, path: str) -> None:
    resp = client.get(path, headers={"Authorization": f"Bearer {marketer_token}"})
    assert resp.status_code == 403


# ── 未認証は 401 ───────────────────────────────────────────
def test_unauthenticated_is_401(client: TestClient) -> None:
    resp = client.get("/ops/health")
    assert resp.status_code == 401


# ── レスポンス内容の確認 ───────────────────────────────────
def test_health_response_structure(client: TestClient, engineer_token: str) -> None:
    resp = client.get("/ops/health", headers={"Authorization": f"Bearer {engineer_token}"})
    data = resp.json()
    assert "overall" in data
    assert "services" in data
    assert data["overall"] == "ok"


def test_kafka_topics_response(client: TestClient, engineer_token: str) -> None:
    resp = client.get("/ops/kafka/topics", headers={"Authorization": f"Bearer {engineer_token}"})
    topics = resp.json()
    assert len(topics) == 1
    assert topics[0]["name"] == "ec.events"
    assert topics[0]["partitions"] == 3
    assert topics[0]["message_count"] == 43707
