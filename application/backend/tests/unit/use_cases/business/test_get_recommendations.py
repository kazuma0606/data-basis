import pytest

from app.domain.entities.customer import UnifiedCustomer
from app.domain.exceptions import NotFoundError
from app.interfaces.repositories.product_repository import ProductResult
from app.use_cases.business.get_recommendations import GetRecommendationsUseCase


class FakeCustomerRepo:
    def __init__(self, customer: UnifiedCustomer | None) -> None:
        self._customer = customer

    async def find_by_id(self, _: int) -> UnifiedCustomer | None:
        return self._customer

    async def find_all(self, **_) -> list[UnifiedCustomer]:
        return []

    async def count(self, **_) -> int:
        return 0


class FakeProductRepo:
    def __init__(self, results: list[ProductResult]) -> None:
        self._results = results

    async def find_similar(self, embedding: list[float], limit: int = 10) -> list[ProductResult]:
        return self._results[:limit]


class FakeLLMClient:
    async def generate(self, prompt: str) -> str:
        return "response"

    async def embed(self, text: str) -> list[float]:
        return [0.1] * 768


_PRODUCTS = [
    ProductResult(i, f"Product {i}", "Brand", 1000, 1, 0.9 - i * 0.01)
    for i in range(1, 6)
]


async def test_returns_product_results() -> None:
    customer = UnifiedCustomer(1, "Test", None, None, None, None)
    use_case = GetRecommendationsUseCase(
        FakeCustomerRepo(customer),
        FakeProductRepo(_PRODUCTS),
        FakeLLMClient(),
    )
    results = await use_case.execute(unified_id=1, limit=3)
    assert len(results) == 3
    assert results[0].similarity > results[1].similarity


async def test_raises_not_found_for_missing_customer() -> None:
    use_case = GetRecommendationsUseCase(
        FakeCustomerRepo(None),
        FakeProductRepo(_PRODUCTS),
        FakeLLMClient(),
    )
    with pytest.raises(NotFoundError):
        await use_case.execute(unified_id=999)
