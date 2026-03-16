from dataclasses import dataclass
from datetime import date
from typing import Protocol


@dataclass
class SalesByChannel:
    date: date
    channel: str
    store_id: int | None
    category_id: int | None
    total_amount: int
    order_count: int
    customer_count: int


@dataclass
class SegmentTrend:
    week: date
    label: str
    customer_count: int
    avg_days_since_purchase: float


@dataclass
class CategoryAffinity:
    week: date
    category_id: int
    age_group: str
    gender: str
    avg_score: float
    customer_count: int


@dataclass
class SegmentCount:
    label: str
    count: int


class IAnalyticsRepository(Protocol):
    async def get_segment_counts(self) -> list[SegmentCount]: ...

    async def get_segment_trend(self, weeks: int = 12) -> list[SegmentTrend]: ...

    async def get_sales_by_channel(
        self,
        days: int = 30,
        store_id: int | None = None,
    ) -> list[SalesByChannel]: ...

    async def get_category_affinity(
        self,
        weeks: int = 4,
        category_id: int | None = None,
    ) -> list[CategoryAffinity]: ...

    async def get_weekly_revenue(self, weeks: int = 1) -> int: ...
