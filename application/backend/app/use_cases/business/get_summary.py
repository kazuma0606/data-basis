from dataclasses import dataclass

from app.interfaces.repositories.analytics_repository import IAnalyticsRepository


@dataclass
class KpiSummary:
    active_customers: int
    dormant_customers: int
    churned_customers: int
    churn_rate: float
    weekly_revenue: int


class GetSummaryUseCase:
    def __init__(self, analytics: IAnalyticsRepository) -> None:
        self._analytics = analytics

    async def execute(self) -> KpiSummary:
        counts = await self._analytics.get_segment_counts()
        weekly_revenue = await self._analytics.get_weekly_revenue(weeks=1)

        count_map = {c.label: c.count for c in counts}
        active = count_map.get("active", 0)
        dormant = count_map.get("dormant", 0)
        churned = count_map.get("churned", 0)
        total = active + dormant + churned
        churn_rate = churned / total if total > 0 else 0.0

        return KpiSummary(
            active_customers=active,
            dormant_customers=dormant,
            churned_customers=churned,
            churn_rate=churn_rate,
            weekly_revenue=weekly_revenue,
        )
