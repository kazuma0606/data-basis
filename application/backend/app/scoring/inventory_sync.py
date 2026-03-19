"""
在庫マスタ同期

Kafka `inventory.updates` トピックから商品マスタを読み込み、
unified_products テーブルに UPSERT する。

スコアリングバッチの前処理として実行する。
"""

from __future__ import annotations

import json
import logging

from kafka import KafkaConsumer
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings

log = logging.getLogger(__name__)

TOPIC = "inventory.updates"
GROUP_ID = "inventory-sync"
CONSUMER_TIMEOUT_MS = 10000


def fetch_inventory_from_kafka() -> list[dict]:
    """Kafka inventory.updates から全商品データを取得する。"""
    consumer = KafkaConsumer(
        TOPIC,
        bootstrap_servers=settings.kafka_bootstrap_servers,
        group_id=GROUP_ID,
        auto_offset_reset="earliest",
        enable_auto_commit=False,
        value_deserializer=lambda v: json.loads(v.decode("utf-8")),
        consumer_timeout_ms=CONSUMER_TIMEOUT_MS,
    )

    records: list[dict] = []
    try:
        for msg in consumer:
            if msg.value.get("event_type") == "inventory_snapshot":
                records.append(msg.value)
    except StopIteration:
        pass

    consumer.commit()
    consumer.close()
    log.info(f"inventory.updates から {len(records)} 件取得")
    return records


async def upsert_unified_products(session: AsyncSession, records: list[dict]) -> int:
    """unified_products に UPSERT する。"""
    if not records:
        return 0

    # product_id でユニーク（重複除去）
    seen: dict[int, dict] = {}
    for r in records:
        pid = r.get("product_id")
        if pid is not None:
            seen[int(pid)] = r

    rows = 0
    for pid, r in seen.items():
        await session.execute(
            text("""
                INSERT INTO unified_products (unified_product_id, category_id, name, brand, price)
                VALUES (:pid, :cat, :name, :brand, :price)
                ON CONFLICT (unified_product_id)
                DO UPDATE SET
                    category_id = EXCLUDED.category_id,
                    name = EXCLUDED.name,
                    brand = EXCLUDED.brand,
                    price = EXCLUDED.price
            """),
            {
                "pid": pid,
                "cat": r.get("category_id"),
                "name": r.get("name", ""),
                "brand": r.get("brand"),
                "price": r.get("price"),
            },
        )
        rows += 1

    return rows


async def run(session: AsyncSession) -> int:
    """在庫同期を実行して更新件数を返す。"""
    records = fetch_inventory_from_kafka()
    if not records:
        log.warning("inventory.updates にデータが見つかりません")
        return 0
    count = await upsert_unified_products(session, records)
    await session.commit()
    log.info(f"unified_products に {count} 件 UPSERT 完了")
    return count
