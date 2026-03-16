from app.domain.exceptions import NotFoundError
from app.interfaces.clients.llm_client import ILLMClient
from app.interfaces.repositories.customer_repository import ICustomerRepository
from app.interfaces.repositories.product_repository import IProductRepository, ProductResult


class GetRecommendationsUseCase:
    def __init__(
        self,
        customer_repo: ICustomerRepository,
        product_repo: IProductRepository,
        llm: ILLMClient,
    ) -> None:
        self._customer_repo = customer_repo
        self._product_repo = product_repo
        self._llm = llm

    async def execute(self, unified_id: int, limit: int = 10) -> list[ProductResult]:
        customer = await self._customer_repo.find_by_id(unified_id)
        if customer is None:
            raise NotFoundError("Customer", unified_id)

        # 顧客属性のテキスト表現を生成してEmbedding化
        text = _build_customer_text(customer)
        embedding = await self._llm.embed(text)

        return await self._product_repo.find_similar(embedding=embedding, limit=limit)


def _build_customer_text(customer) -> str:  # type: ignore[no-untyped-def]
    parts = []
    if customer.prefecture:
        parts.append(f"prefecture:{customer.prefecture}")
    if customer.churn_label:
        parts.append(f"segment:{customer.churn_label.label}")
    for score in customer.scores:
        parts.append(f"category:{score.category_id}:affinity:{score.affinity_score:.1f}")
    return " ".join(parts) if parts else "customer"
