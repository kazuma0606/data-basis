"""
Integration tests — VM上の ClickHouse が起動している場合のみ実行。

実行方法:
    uv run python -m pytest -m integration tests/integration/
"""

import pytest

from app.infrastructure.repositories.clickhouse_analytics_repository import (
    ClickHouseAnalyticsRepository,
)


@pytest.mark.integration
async def test_get_segment_counts_returns_list() -> None:
    repo = ClickHouseAnalyticsRepository()
    counts = await repo.get_segment_counts()
    assert isinstance(counts, list)


@pytest.mark.integration
async def test_get_segment_trend_returns_list() -> None:
    repo = ClickHouseAnalyticsRepository()
    trend = await repo.get_segment_trend(weeks=4)
    assert isinstance(trend, list)


@pytest.mark.integration
async def test_get_sales_by_channel_returns_list() -> None:
    repo = ClickHouseAnalyticsRepository()
    sales = await repo.get_sales_by_channel(days=30)
    assert isinstance(sales, list)


@pytest.mark.integration
async def test_get_category_affinity_returns_list() -> None:
    repo = ClickHouseAnalyticsRepository()
    affinity = await repo.get_category_affinity(weeks=4)
    assert isinstance(affinity, list)


@pytest.mark.integration
async def test_get_weekly_revenue_returns_int() -> None:
    repo = ClickHouseAnalyticsRepository()
    revenue = await repo.get_weekly_revenue(weeks=1)
    assert isinstance(revenue, int)
    assert revenue >= 0
