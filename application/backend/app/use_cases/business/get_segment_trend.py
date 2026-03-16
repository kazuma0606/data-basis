from app.interfaces.repositories.analytics_repository import IAnalyticsRepository, SegmentTrend


class GetSegmentTrendUseCase:
    def __init__(self, analytics: IAnalyticsRepository) -> None:
        self._analytics = analytics

    async def execute(self, weeks: int = 12) -> list[SegmentTrend]:
        return await self._analytics.get_segment_trend(weeks=weeks)
