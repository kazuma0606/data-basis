from datetime import date, datetime

import pytest
from fastapi.testclient import TestClient

from app.dependencies import (
    get_analytics_repository,
    get_cache_client,
    get_customer_repository,
    get_llm_client,
    get_product_repository,
)
from app.domain.entities.customer import ChurnLabel, CustomerScore, UnifiedCustomer
from app.interfaces.repositories.analytics_repository import (
    CategoryAffinity,
    SegmentCount,
    SegmentTrend,
    SalesByChannel,
)
from app.interfaces.repositories.product_repository import ProductResult
from app.main import app

_NOW = datetime(2026, 3, 16, 0, 0, 0)
_TODAY = date(2026, 3, 16)

_CUSTOMERS = [
    UnifiedCustomer(
        unified_id=1,
        canonical_name="田中 太郎",
        email="tanaka@example.com",
        phone="+819012345678",
        birth_date=date(1985, 4, 1),
        prefecture="東京都",
        churn_label=ChurnLabel(1, "active", _NOW, 5, _NOW),
        scores=[CustomerScore(1, 1, 80.0, 0.1, 0.7, 0.5, _NOW)],
    ),
    UnifiedCustomer(
        unified_id=2,
        canonical_name="鈴木 花子",
        email=None,
        phone=None,
        birth_date=None,
        prefecture="大阪府",
        churn_label=ChurnLabel(2, "dormant", _NOW, 120, _NOW),
        scores=[],
    ),
]


class FakeCustomerRepository:
    async def find_by_id(self, unified_id: int) -> UnifiedCustomer | None:
        return next((c for c in _CUSTOMERS if c.unified_id == unified_id), None)

    async def find_all(self, store_id=None, offset=0, limit=20) -> list[UnifiedCustomer]:
        return _CUSTOMERS[offset: offset + limit]

    async def count(self, store_id=None) -> int:
        return len(_CUSTOMERS)


class FakeAnalyticsRepository:
    async def get_segment_counts(self) -> list[SegmentCount]:
        return [SegmentCount("active", 100), SegmentCount("dormant", 50), SegmentCount("churned", 20)]

    async def get_segment_trend(self, weeks: int = 12) -> list[SegmentTrend]:
        return [SegmentTrend(_TODAY, "active", 100, 30.0)]

    async def get_sales_by_channel(self, days: int = 30, store_id=None) -> list[SalesByChannel]:
        return [SalesByChannel(_TODAY, "ec", None, 1, 500000, 100, 80)]

    async def get_category_affinity(self, weeks: int = 4, category_id=None) -> list[CategoryAffinity]:
        return [CategoryAffinity(_TODAY, 1, "30s", "female", 75.5, 120)]

    async def get_weekly_revenue(self, weeks: int = 1) -> int:
        return 1500000


class FakeProductRepository:
    async def find_similar(self, embedding: list[float], limit: int = 10) -> list[ProductResult]:
        return [ProductResult(1, "テレビ 55型", "Sony", 150000, 1, 0.95)]


class FakeLLMClient:
    async def generate(self, prompt: str) -> str:
        return "アクティブ顧客は100人います。"

    async def embed(self, text: str) -> list[float]:
        return [0.1] * 768


class FakeCacheClient:
    async def get(self, key: str) -> str | None:
        return None

    async def set(self, key: str, value: str, ttl_seconds: int = 86400) -> None:
        pass

    async def delete(self, key: str) -> None:
        pass


@pytest.fixture
def marketer_client() -> TestClient:
    from app.dependencies import get_user_repository
    from tests.e2e.conftest import FakeUserRepository

    app.dependency_overrides[get_user_repository] = lambda: FakeUserRepository()
    app.dependency_overrides[get_customer_repository] = lambda: FakeCustomerRepository()
    app.dependency_overrides[get_analytics_repository] = lambda: FakeAnalyticsRepository()
    app.dependency_overrides[get_product_repository] = lambda: FakeProductRepository()
    app.dependency_overrides[get_llm_client] = lambda: FakeLLMClient()
    app.dependency_overrides[get_cache_client] = lambda: FakeCacheClient()

    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def marketer_token(marketer_client: TestClient) -> str:
    resp = marketer_client.post("/auth/login", json={"username": "marketer", "password": "marketer123"})
    return resp.json()["access_token"]


@pytest.fixture
def engineer_token(marketer_client: TestClient) -> str:
    resp = marketer_client.post("/auth/login", json={"username": "engineer", "password": "engineer123"})
    return resp.json()["access_token"]


# ── ロールアクセス制御 ─────────────────────────────────────────

@pytest.mark.parametrize("path", [
    "/business/summary",
    "/business/customers",
    "/business/segments/summary",
    "/business/segments/trend",
    "/business/analytics/sales",
    "/business/analytics/affinity",
])
def test_marketer_can_access_business(marketer_client: TestClient, marketer_token: str, path: str) -> None:
    resp = marketer_client.get(path, headers={"Authorization": f"Bearer {marketer_token}"})
    assert resp.status_code == 200


@pytest.mark.parametrize("path", [
    "/business/summary",
    "/business/customers",
    "/business/segments/summary",
])
def test_engineer_cannot_access_business(marketer_client: TestClient, engineer_token: str, path: str) -> None:
    resp = marketer_client.get(path, headers={"Authorization": f"Bearer {engineer_token}"})
    assert resp.status_code == 403


def test_unauthenticated_is_401(marketer_client: TestClient) -> None:
    resp = marketer_client.get("/business/summary")
    assert resp.status_code == 401


# ── レスポンス内容の確認 ───────────────────────────────────────

def test_summary_structure(marketer_client: TestClient, marketer_token: str) -> None:
    resp = marketer_client.get("/business/summary", headers={"Authorization": f"Bearer {marketer_token}"})
    data = resp.json()
    assert "active_customers" in data
    assert "churn_rate" in data
    assert "weekly_revenue" in data
    assert data["active_customers"] == 100
    assert data["weekly_revenue"] == 1500000


def test_customer_list_structure(marketer_client: TestClient, marketer_token: str) -> None:
    resp = marketer_client.get("/business/customers", headers={"Authorization": f"Bearer {marketer_token}"})
    data = resp.json()
    assert "items" in data
    assert "total" in data
    assert data["total"] == 2
    assert data["items"][0]["canonical_name"] == "田中 太郎"
    assert data["items"][0]["churn_label"] == "active"


def test_customer_detail_structure(marketer_client: TestClient, marketer_token: str) -> None:
    resp = marketer_client.get("/business/customers/1", headers={"Authorization": f"Bearer {marketer_token}"})
    data = resp.json()
    assert data["unified_id"] == 1
    assert data["churn_label"]["label"] == "active"
    assert len(data["scores"]) == 1


def test_customer_not_found_returns_404(marketer_client: TestClient, marketer_token: str) -> None:
    resp = marketer_client.get("/business/customers/9999", headers={"Authorization": f"Bearer {marketer_token}"})
    assert resp.status_code == 404


def test_recommendations_structure(marketer_client: TestClient, marketer_token: str) -> None:
    resp = marketer_client.get(
        "/business/customers/1/recommendations",
        headers={"Authorization": f"Bearer {marketer_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["name"] == "テレビ 55型"
    assert data[0]["similarity"] == 0.95


def test_segment_summary_structure(marketer_client: TestClient, marketer_token: str) -> None:
    resp = marketer_client.get("/business/segments/summary", headers={"Authorization": f"Bearer {marketer_token}"})
    items = resp.json()
    assert len(items) == 3
    labels = {i["label"] for i in items}
    assert "active" in labels


def test_natural_language_query(marketer_client: TestClient, marketer_token: str) -> None:
    resp = marketer_client.post(
        "/business/query",
        json={"query": "アクティブ顧客は何人いますか？"},
        headers={"Authorization": f"Bearer {marketer_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "query" in data
    assert "answer" in data
    assert len(data["answer"]) > 0
