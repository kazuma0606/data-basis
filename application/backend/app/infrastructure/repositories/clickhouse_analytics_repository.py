from datetime import date
from typing import Any

from app.infrastructure.database.clickhouse import ch_query
from app.interfaces.repositories.analytics_repository import (
    CategoryAffinity,
    SalesByChannel,
    SegmentCount,
    SegmentTrend,
)


class ClickHouseAnalyticsRepository:
    async def get_segment_counts(self) -> list[SegmentCount]:
        # churn_summary_weeklyの直近週を使用
        rows = await ch_query("""
            SELECT label, sum(customer_count) AS cnt
            FROM churn_summary_weekly
            WHERE week = (SELECT max(week) FROM churn_summary_weekly)
            GROUP BY label
        """)
        return [SegmentCount(label=r["label"], count=int(r["cnt"])) for r in rows]

    async def get_segment_trend(self, weeks: int = 12) -> list[SegmentTrend]:
        rows = await ch_query(
            """
            SELECT week, label, customer_count, avg_days_since_purchase
            FROM churn_summary_weekly
            WHERE week >= today() - toIntervalWeek({weeks:UInt32})
            ORDER BY week ASC, label ASC
            """,
            parameters={"weeks": weeks},
        )
        return [
            SegmentTrend(
                week=r["week"]
                if isinstance(r["week"], date)
                else date.fromisoformat(str(r["week"])),
                label=r["label"],
                customer_count=int(r["customer_count"]),
                avg_days_since_purchase=float(r["avg_days_since_purchase"]),
            )
            for r in rows
        ]

    async def get_sales_by_channel(
        self,
        days: int = 30,
        store_id: int | None = None,
    ) -> list[SalesByChannel]:
        base_query = """
            SELECT date, channel, store_id, category_id,
                   total_amount, order_count, customer_count
            FROM sales_by_channel
            WHERE date >= today() - toIntervalDay({days:UInt32})
        """
        params: dict[str, Any] = {"days": days}
        if store_id is not None:
            base_query += " AND store_id = {store_id:Int32}"
            params["store_id"] = store_id
        base_query += " ORDER BY date DESC"

        rows = await ch_query(base_query, parameters=params)
        return [
            SalesByChannel(
                date=r["date"]
                if isinstance(r["date"], date)
                else date.fromisoformat(str(r["date"])),
                channel=r["channel"],
                store_id=r["store_id"],
                category_id=r["category_id"],
                total_amount=int(r["total_amount"]),
                order_count=int(r["order_count"]),
                customer_count=int(r["customer_count"]),
            )
            for r in rows
        ]

    async def get_category_affinity(
        self,
        weeks: int = 4,
        category_id: int | None = None,
    ) -> list[CategoryAffinity]:
        base_query = """
            SELECT week, category_id, age_group, gender, avg_score, customer_count
            FROM category_affinity_summary
            WHERE week >= today() - toIntervalWeek({weeks:UInt32})
        """
        params: dict[str, Any] = {"weeks": weeks}
        if category_id is not None:
            base_query += " AND category_id = {category_id:Int32}"
            params["category_id"] = category_id
        base_query += " ORDER BY week DESC, category_id ASC"

        rows = await ch_query(base_query, parameters=params)
        return [
            CategoryAffinity(
                week=r["week"]
                if isinstance(r["week"], date)
                else date.fromisoformat(str(r["week"])),
                category_id=int(r["category_id"]),
                age_group=r["age_group"],
                gender=r["gender"],
                avg_score=float(r["avg_score"]),
                customer_count=int(r["customer_count"]),
            )
            for r in rows
        ]

    async def get_weekly_revenue(self, weeks: int = 1) -> int:
        rows = await ch_query(
            """
            SELECT sum(total_amount) AS revenue
            FROM sales_by_channel
            WHERE date >= today() - toIntervalWeek({weeks:UInt32})
            """,
            parameters={"weeks": weeks},
        )
        if not rows:
            return 0
        return int(rows[0].get("revenue") or 0)
