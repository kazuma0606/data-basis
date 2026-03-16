from dataclasses import dataclass

from app.domain.entities.customer import UnifiedCustomer
from app.domain.entities.user import AuthUser
from app.domain.value_objects.role import Role
from app.interfaces.repositories.customer_repository import ICustomerRepository


@dataclass
class CustomerListResult:
    items: list[UnifiedCustomer]
    total: int
    offset: int
    limit: int


class ListCustomersUseCase:
    def __init__(self, repo: ICustomerRepository) -> None:
        self._repo = repo

    async def execute(
        self,
        current_user: AuthUser,
        offset: int = 0,
        limit: int = 20,
    ) -> CustomerListResult:
        # store_manager は自店舗の顧客のみ（store_id でフィルタ）
        store_id = current_user.store_id if current_user.role == Role.STORE_MANAGER else None

        items = await self._repo.find_all(store_id=store_id, offset=offset, limit=limit)
        total = await self._repo.count(store_id=store_id)
        return CustomerListResult(items=items, total=total, offset=offset, limit=limit)
