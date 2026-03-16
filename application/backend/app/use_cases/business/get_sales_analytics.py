from app.interfaces.repositories.analytics_repository import IAnalyticsRepository, SalesByChannel


class GetSalesAnalyticsUseCase:
    def __init__(self, analytics: IAnalyticsRepository) -> None:
        self._analytics = analytics

    async def execute(
        self,
        days: int = 30,
        store_id: int | None = None,
    ) -> list[SalesByChannel]:
        return await self._analytics.get_sales_by_channel(days=days, store_id=store_id)
