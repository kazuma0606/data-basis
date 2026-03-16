from dataclasses import dataclass

from app.interfaces.repositories.analytics_repository import IAnalyticsRepository


@dataclass
class SegmentSummaryItem:
    label: str
    count: int
    percentage: float


class GetSegmentSummaryUseCase:
    def __init__(self, analytics: IAnalyticsRepository) -> None:
        self._analytics = analytics

    async def execute(self) -> list[SegmentSummaryItem]:
        counts = await self._analytics.get_segment_counts()
        total = sum(c.count for c in counts)
        return [
            SegmentSummaryItem(
                label=c.label,
                count=c.count,
                percentage=round(c.count / total * 100, 2) if total > 0 else 0.0,
            )
            for c in counts
        ]
