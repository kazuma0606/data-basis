from dataclasses import dataclass
from typing import Protocol


@dataclass
class ProductResult:
    unified_product_id: int
    name: str
    brand: str | None
    price: int | None
    category_id: int | None
    similarity: float


class IProductRepository(Protocol):
    async def find_similar(
        self,
        embedding: list[float],
        limit: int = 10,
    ) -> list[ProductResult]: ...
