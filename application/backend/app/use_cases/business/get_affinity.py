from app.interfaces.repositories.analytics_repository import CategoryAffinity, IAnalyticsRepository


class GetAffinityUseCase:
    def __init__(self, analytics: IAnalyticsRepository) -> None:
        self._analytics = analytics

    async def execute(
        self,
        weeks: int = 4,
        category_id: int | None = None,
    ) -> list[CategoryAffinity]:
        return await self._analytics.get_category_affinity(weeks=weeks, category_id=category_id)
