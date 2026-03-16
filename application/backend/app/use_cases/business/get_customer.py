from app.domain.entities.customer import UnifiedCustomer
from app.domain.exceptions import NotFoundError
from app.interfaces.repositories.customer_repository import ICustomerRepository


class GetCustomerUseCase:
    def __init__(self, repo: ICustomerRepository) -> None:
        self._repo = repo

    async def execute(self, unified_id: int) -> UnifiedCustomer:
        customer = await self._repo.find_by_id(unified_id)
        if customer is None:
            raise NotFoundError("Customer", unified_id)
        return customer
