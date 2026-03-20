"""
PostgreSQL staging → ClickHouse 日次 ETL

PostgreSQL の staging テーブルから集計データを ClickHouse の分析テーブルに転送する。

対象テーブル:
  staging_ec_events       → ec_events       (ClickHouse)
  staging_pos_transactions → pos_transactions (ClickHouse)
  customer_scores          → sales_by_channel (ClickHouse) ※ チャネル別日次集計

使い方（バックエンドコンテナ内）:
  python3 -m app.pipelines.etl.pg_to_clickhouse [--date YYYY-MM-DD]

  --date: 対象日付（省略時: 昨日）

運用:
  Kubernetes CronJob として毎日 04:00 JST に実行する。
  infrastructure/k8s/etl/cronjob-etl.yaml
"""

from __future__ import annotations

import argparse
import asyncio
import logging
from datetime import date, datetime, timedelta

import clickhouse_connect
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)


def _get_ch_client():
    return clickhouse_connect.get_client(
        host=settings.clickhouse_host,
        port=int(settings.clickhouse_port),
        database=settings.clickhouse_db,
        username=settings.clickhouse_user,
        password=settings.clickhouse_password,
    )


# ── EC イベント転送 ────────────────────────────────────────────


async def etl_ec_events(session: AsyncSession, ch, target_date: date) -> int:
    """
    staging_ec_events → ClickHouse ec_events
    ec_order イベントの注文データを転送する。
    """
    rows = await session.execute(
        text("""
            SELECT
                (raw::jsonb->>'order_id')::text                AS event_id,
                (raw::jsonb->>'ec_user_id')::text              AS customer_id,
                COALESCE(event_type, 'ec_order')               AS event_type,
                COALESCE(
                    (raw::jsonb->'items'->0->>'ec_product_id'),
                    'unknown'
                )                                              AS product_id,
                (raw::jsonb->>'total_amount')::float           AS amount,
                ordered_at::date                               AS event_date,
                ordered_at                                     AS event_time
            FROM staging_ec_events
            WHERE event_type = 'ec_order'
              AND ordered_at::date = :target_date
              AND ordered_at IS NOT NULL
        """),
        {"target_date": target_date},
    )
    data = rows.fetchall()
    if not data:
        log.info(f"ec_events: {target_date} の対象レコードなし")
        return 0

    rows_list = [
        [str(r[0]), str(r[1]), str(r[2]), str(r[3]), float(r[4]) if r[4] else 0.0, r[5], r[6]]
        for r in data
    ]

    ch.insert(
        "ec_events",
        rows_list,
        column_names=[
            "event_id",
            "customer_id",
            "event_type",
            "product_id",
            "amount",
            "event_date",
            "event_time",
        ],
    )
    log.info(f"ec_events: {len(rows_list)} 行 → ClickHouse ({target_date})")
    return len(rows_list)


# ── POS トランザクション転送 ───────────────────────────────────


async def etl_pos_transactions(session: AsyncSession, ch, target_date: date) -> int:
    """
    staging_pos_transactions → ClickHouse pos_transactions
    """
    rows = await session.execute(
        text("""
            SELECT
                (raw::jsonb->>'transaction_id')::text          AS txn_id,
                (raw::jsonb->>'member_id')::text               AS customer_id,
                (raw::jsonb->>'store_id')::text                AS store_id,
                COALESCE(
                    (raw::jsonb->>'ec_product_id'),
                    'unknown'
                )                                              AS product_id,
                1                                              AS quantity,
                (raw::jsonb->>'total_amount')::float           AS amount,
                transacted_at::date                            AS txn_date,
                transacted_at                                  AS txn_time
            FROM staging_pos_transactions
            WHERE event_type = 'pos_transaction'
              AND transacted_at::date = :target_date
              AND transacted_at IS NOT NULL
        """),
        {"target_date": target_date},
    )
    data = rows.fetchall()
    if not data:
        log.info(f"pos_transactions: {target_date} の対象レコードなし")
        return 0

    rows_list = [
        [
            str(r[0]),
            str(r[1]),
            str(r[2]),
            str(r[3]),
            int(r[4]),
            float(r[5]) if r[5] else 0.0,
            r[6],
            r[7],
        ]
        for r in data
    ]

    ch.insert(
        "pos_transactions",
        rows_list,
        column_names=[
            "txn_id",
            "customer_id",
            "store_id",
            "product_id",
            "quantity",
            "amount",
            "txn_date",
            "txn_time",
        ],
    )
    log.info(f"pos_transactions: {len(rows_list)} 行 → ClickHouse ({target_date})")
    return len(rows_list)


# ── チャネル別日次集計 ─────────────────────────────────────────


async def etl_sales_by_channel(session: AsyncSession, ch, target_date: date) -> int:
    """
    EC + POS の日次チャネル別売上集計 → ClickHouse sales_by_channel
    """
    rows = await session.execute(
        text("""
            SELECT
                :target_date                          AS date,
                'ec'                                  AS channel,
                0                                     AS store_id,
                0                                     AS category_id,
                SUM((raw::jsonb->>'total_amount')::float)::bigint AS total_amount,
                COUNT(*)                              AS order_count,
                COUNT(DISTINCT raw::jsonb->>'ec_user_id') AS customer_count
            FROM staging_ec_events
            WHERE event_type = 'ec_order'
              AND ordered_at::date = :target_date

            UNION ALL

            SELECT
                :target_date                          AS date,
                'pos'                                 AS channel,
                COALESCE((raw::jsonb->>'store_id')::int, 0) AS store_id,
                0                                     AS category_id,
                SUM((raw::jsonb->>'total_amount')::float)::bigint AS total_amount,
                COUNT(*)                              AS order_count,
                COUNT(DISTINCT raw::jsonb->>'member_id') AS customer_count
            FROM staging_pos_transactions
            WHERE event_type = 'pos_transaction'
              AND transacted_at::date = :target_date
            GROUP BY raw::jsonb->>'store_id'
        """),
        {"target_date": target_date},
    )
    data = rows.fetchall()
    if not data:
        log.info(f"sales_by_channel: {target_date} の対象レコードなし")
        return 0

    rows_list = [
        [
            r[0],
            str(r[1]),
            int(r[2] or 0),
            int(r[3] or 0),
            int(r[4] or 0),
            int(r[5] or 0),
            int(r[6] or 0),
        ]
        for r in data
    ]

    ch.insert(
        "sales_by_channel",
        rows_list,
        column_names=[
            "date",
            "channel",
            "store_id",
            "category_id",
            "total_amount",
            "order_count",
            "customer_count",
        ],
    )
    log.info(f"sales_by_channel: {len(rows_list)} 行 → ClickHouse ({target_date})")
    return len(rows_list)


# ── メイン ────────────────────────────────────────────────────


async def main_async(target_date: date) -> None:
    log.info(f"ETL 開始: target_date={target_date}")

    engine = create_async_engine(settings.postgres_url, echo=False)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    ch = _get_ch_client()

    total = 0
    async with factory() as session:
        total += await etl_ec_events(session, ch, target_date)
        total += await etl_pos_transactions(session, ch, target_date)
        total += await etl_sales_by_channel(session, ch, target_date)

    ch.close()
    await engine.dispose()
    log.info(f"ETL 完了: 合計 {total} 行を ClickHouse に転送")


def main() -> None:
    parser = argparse.ArgumentParser(description="PG staging → ClickHouse ETL")
    parser.add_argument(
        "--date",
        type=lambda s: datetime.strptime(s, "%Y-%m-%d").date(),
        default=date.today() - timedelta(days=1),
        help="対象日付 YYYY-MM-DD（省略時: 昨日）",
    )
    args = parser.parse_args()
    asyncio.run(main_async(args.date))


if __name__ == "__main__":
    main()
