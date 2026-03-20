from datetime import datetime

import pytest

from app.domain.entities.customer import ChurnLabel, UnifiedCustomer
from app.domain.exceptions import NotFoundError
from app.use_cases.business.get_customer import GetCustomerUseCase


def _now() -> datetime:
    return datetime(2026, 3, 16, 0, 0, 0)


class FakeCustomerRepository:
    def __init__(self, customer: UnifiedCustomer | None) -> None:
        self._customer = customer

    async def find_by_id(self, unified_id: int) -> UnifiedCustomer | None:
        return self._customer

    async def find_all(self, **_kwargs) -> list[UnifiedCustomer]:
        return []

    async def count(self, **_kwargs) -> int:
        return 0


async def test_returns_customer_when_found() -> None:
    customer = UnifiedCustomer(
        unified_id=1,
        canonical_name="田中 太郎",
        email="tanaka@example.com",
        phone="+819012345678",
        birth_date=None,
        prefecture="東京都",
        churn_label=ChurnLabel(
            unified_id=1,
            label="active",
            last_purchase_at=_now(),
            days_since_purchase=5,
            updated_at=_now(),
        ),
    )
    repo = FakeCustomerRepository(customer)
    result = await GetCustomerUseCase(repo).execute(1)
    assert result.unified_id == 1
    assert result.churn_label is not None
    assert result.churn_label.label == "active"


async def test_raises_not_found_when_missing() -> None:
    repo = FakeCustomerRepository(None)
    with pytest.raises(NotFoundError):
        await GetCustomerUseCase(repo).execute(999)


async def test_cache_hit_skips_repo() -> None:
    """キャッシュにデータがある場合、リポジトリを呼ばない"""
    from app.use_cases.business.get_customer import _cache_key, _to_json
    from tests.conftest import InMemoryCacheClient

    customer = UnifiedCustomer(1, "Cached User", None, None, None, None)
    cache = InMemoryCacheClient()
    await cache.set(_cache_key(1), _to_json(customer))

    class NeverCallRepo:
        async def find_by_id(self, _: int) -> None:
            raise AssertionError("should not be called")

        async def find_all(self, **_) -> list:
            return []

        async def count(self, **_) -> int:
            return 0

    result = await GetCustomerUseCase(NeverCallRepo(), cache).execute(1)
    assert result.unified_id == 1
    assert result.canonical_name == "Cached User"


async def test_cache_miss_fetches_from_repo_and_stores() -> None:
    """キャッシュミスの場合、リポジトリから取得してキャッシュに書き込む"""
    from app.use_cases.business.get_customer import _cache_key
    from tests.conftest import InMemoryCacheClient

    customer = UnifiedCustomer(2, "DB User", None, None, None, None)
    repo = FakeCustomerRepository(customer)
    cache = InMemoryCacheClient()

    result = await GetCustomerUseCase(repo, cache).execute(2)
    assert result.unified_id == 2

    # キャッシュに書き込まれたことを確認
    cached = await cache.get(_cache_key(2))
    assert cached is not None
