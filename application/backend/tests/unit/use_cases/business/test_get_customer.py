import pytest

from app.domain.entities.customer import ChurnLabel, CustomerScore, UnifiedCustomer
from app.domain.exceptions import NotFoundError
from app.use_cases.business.get_customer import GetCustomerUseCase
from datetime import datetime


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
