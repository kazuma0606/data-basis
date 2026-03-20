"""
在庫変動プロデューサー

verification/technomart.db の master_products を読み込み、
Kafka トピック `inventory.updates` に送信する。

使い方（バックエンドコンテナ内）:
  python3 -m app.pipelines.producers.inventory_producer --sqlite-path /tmp/technomart.db
"""

from __future__ import annotations

import argparse
import logging
import sqlite3
from pathlib import Path

from app.pipelines.producers.base import make_producer, send

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

TOPIC = "inventory.updates"
try:
    DEFAULT_SQLITE = Path(__file__).parents[6] / "verification" / "technomart.db"
except IndexError:
    DEFAULT_SQLITE = Path("/tmp/technomart.db")


def main(sqlite_path: Path) -> None:
    if not sqlite_path.exists():
        raise FileNotFoundError(f"SQLite DB が見つかりません: {sqlite_path}")

    log.info(f"SQLite: {sqlite_path}")
    conn = sqlite3.connect(sqlite_path)
    producer = make_producer()

    rows = conn.execute(
        "SELECT product_id, category_id, name, brand, price, is_active FROM master_products"
    ).fetchall()

    log.info(f"[{TOPIC}] 商品マスタ送信中... ({len(rows)} 件)")
    for row in rows:
        pid, cat_id, name, brand, price, is_active = row
        send(
            producer,
            TOPIC,
            {
                "event_type": "inventory_snapshot",
                "product_id": pid,
                "category_id": cat_id,
                "name": name,
                "brand": brand,
                "price": price,
                "is_active": bool(is_active),
            },
        )

    producer.flush()
    producer.close()
    conn.close()
    log.info(f"完了: {len(rows)} メッセージ送信")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--sqlite-path", default=str(DEFAULT_SQLITE))
    args = parser.parse_args()
    main(Path(args.sqlite_path))
