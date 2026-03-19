"""
PostgreSQL 取り込みコンシューマー

ec.events / pos.transactions / app.behaviors を購読し、
PostgreSQL の staging テーブルに書き込む。

  staging_ec_events       ← ec.events
  staging_pos_transactions ← pos.transactions
  staging_app_behaviors   ← app.behaviors

使い方（バックエンドコンテナ内）:
  python3 -m app.pipelines.consumers.pg_consumer

運用:
  Kubernetes CronJob として定期実行する想定。
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections import defaultdict
from datetime import datetime, timezone

from kafka import KafkaConsumer
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)


def _to_int(v) -> int | None:
    """文字列・数値・None を int に変換する。変換不能の場合は None。"""
    if v is None:
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _to_float(v) -> float | None:
    """文字列・数値・None を float に変換する。変換不能の場合は None。"""
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _to_dt(v) -> datetime | None:
    """ISO文字列・datetime・None を datetime に変換する。変換不能の場合は None。"""
    if v is None:
        return None
    if isinstance(v, datetime):
        return v
    try:
        return datetime.fromisoformat(str(v))
    except (TypeError, ValueError):
        return None

TOPICS = ["ec.events", "pos.transactions", "app.behaviors"]
GROUP_ID = "pg-writer"
CONSUMER_TIMEOUT_MS = 10000


# ── PostgreSQL 書き込み ────────────────────────────────────────

async def write_ec_events(session: AsyncSession, records: list[dict]) -> int:
    if not records:
        return 0
    from sqlalchemy import text
    await session.execute(
        text("""
            CREATE TABLE IF NOT EXISTS staging_ec_events (
                id SERIAL PRIMARY KEY,
                event_type VARCHAR(50),
                order_id INTEGER,
                ec_user_id INTEGER,
                ec_product_id INTEGER,
                session_id VARCHAR(100),
                ordered_at TIMESTAMP,
                total_amount INTEGER,
                status VARCHAR(20),
                event_value FLOAT,
                timestamp TIMESTAMP,
                raw JSONB,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """)
    )
    rows = 0
    for r in records:
        await session.execute(
            text("""
                INSERT INTO staging_ec_events
                    (event_type, order_id, ec_user_id, ec_product_id, session_id,
                     ordered_at, total_amount, status, event_value, timestamp, raw)
                VALUES
                    (:event_type, :order_id, :ec_user_id, :ec_product_id, :session_id,
                     :ordered_at, :total_amount, :status, :event_value, :timestamp, :raw)
            """),
            {
                "event_type": r.get("event_type"),
                "order_id": _to_int(r.get("order_id")),
                "ec_user_id": _to_int(r.get("ec_user_id")),
                "ec_product_id": _to_int(r.get("ec_product_id")),
                "session_id": r.get("session_id"),
                "ordered_at": _to_dt(r.get("ordered_at")),
                "total_amount": _to_int(r.get("total_amount")),
                "status": r.get("status"),
                "event_value": _to_float(r.get("event_value")),
                "timestamp": _to_dt(r.get("timestamp")),
                "raw": json.dumps(r, ensure_ascii=False, default=str),
            },
        )
        rows += 1
    return rows


async def write_pos_transactions(session: AsyncSession, records: list[dict]) -> int:
    if not records:
        return 0
    from sqlalchemy import text
    await session.execute(
        text("""
            CREATE TABLE IF NOT EXISTS staging_pos_transactions (
                id SERIAL PRIMARY KEY,
                event_type VARCHAR(50),
                transaction_id INTEGER,
                member_id INTEGER,
                store_id INTEGER,
                transacted_at TIMESTAMP,
                visited_at TIMESTAMP,
                total_amount INTEGER,
                duration_min INTEGER,
                raw JSONB,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """)
    )
    rows = 0
    for r in records:
        await session.execute(
            text("""
                INSERT INTO staging_pos_transactions
                    (event_type, transaction_id, member_id, store_id,
                     transacted_at, visited_at, total_amount, duration_min, raw)
                VALUES
                    (:event_type, :transaction_id, :member_id, :store_id,
                     :transacted_at, :visited_at, :total_amount, :duration_min, :raw)
            """),
            {
                "event_type": r.get("event_type"),
                "transaction_id": _to_int(r.get("transaction_id")),
                "member_id": _to_int(r.get("member_id")),
                "store_id": _to_int(r.get("store_id")),
                "transacted_at": _to_dt(r.get("transacted_at")),
                "visited_at": _to_dt(r.get("visited_at")),
                "total_amount": _to_int(r.get("total_amount")),
                "duration_min": _to_int(r.get("duration_min")),
                "raw": json.dumps(r, ensure_ascii=False, default=str),
            },
        )
        rows += 1
    return rows


async def write_app_behaviors(session: AsyncSession, records: list[dict]) -> int:
    if not records:
        return 0
    from sqlalchemy import text
    await session.execute(
        text("""
            CREATE TABLE IF NOT EXISTS staging_app_behaviors (
                id SERIAL PRIMARY KEY,
                event_type VARCHAR(50),
                event_id INTEGER,
                uid VARCHAR(36),
                event_value FLOAT,
                timestamp TIMESTAMP,
                raw JSONB,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """)
    )
    rows = 0
    for r in records:
        await session.execute(
            text("""
                INSERT INTO staging_app_behaviors
                    (event_type, event_id, uid, event_value, timestamp, raw)
                VALUES
                    (:event_type, :event_id, :uid, :event_value, :timestamp, :raw)
            """),
            {
                "event_type": r.get("event_type"),
                "event_id": _to_int(r.get("event_id")),
                "uid": r.get("uid"),
                "event_value": _to_float(r.get("event_value")),
                "timestamp": _to_dt(r.get("timestamp")),
                "raw": json.dumps(r, ensure_ascii=False, default=str),
            },
        )
        rows += 1
    return rows


async def flush_to_pg(buffer: dict[str, list[dict]]) -> dict[str, int]:
    engine = create_async_engine(settings.postgres_url, echo=False)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    counts = {}

    async with factory() as session:
        counts["ec.events"] = await write_ec_events(session, buffer.get("ec.events", []))
        counts["pos.transactions"] = await write_pos_transactions(session, buffer.get("pos.transactions", []))
        counts["app.behaviors"] = await write_app_behaviors(session, buffer.get("app.behaviors", []))
        await session.commit()

    await engine.dispose()
    return counts


# ── メイン ────────────────────────────────────────────────────

def main() -> None:
    consumer = KafkaConsumer(
        *TOPICS,
        bootstrap_servers=settings.kafka_bootstrap_servers,
        group_id=GROUP_ID,
        auto_offset_reset="earliest",
        enable_auto_commit=False,
        value_deserializer=lambda v: json.loads(v.decode("utf-8")),
        consumer_timeout_ms=CONSUMER_TIMEOUT_MS,
    )

    buffer: dict[str, list[dict]] = defaultdict(list)
    total = 0

    log.info(f"コンシューマー開始: {TOPICS}")
    try:
        for msg in consumer:
            buffer[msg.topic].append(msg.value)
            total += 1
    except StopIteration:
        log.info(f"  タイムアウト: {CONSUMER_TIMEOUT_MS}ms 間メッセージなし")

    if total > 0:
        log.info(f"{total} 件を PostgreSQL に書き込み中...")
        counts = asyncio.run(flush_to_pg(buffer))
        for topic, n in counts.items():
            log.info(f"  {topic}: {n} 件")

    consumer.commit()
    consumer.close()
    log.info(f"完了: 合計 {total} メッセージ処理")


if __name__ == "__main__":
    main()
