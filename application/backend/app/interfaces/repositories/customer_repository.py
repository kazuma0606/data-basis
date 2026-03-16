from typing import Protocol

from app.domain.entities.customer import UnifiedCustomer


class ICustomerRepository(Protocol):
    async def find_by_id(self, unified_id: int) -> UnifiedCustomer | None: ...

    async def find_all(
        self,
        store_id: int | None = None,
        offset: int = 0,
        limit: int = 20,
    ) -> list[UnifiedCustomer]: ...

    async def count(self, store_id: int | None = None) -> int: ...
