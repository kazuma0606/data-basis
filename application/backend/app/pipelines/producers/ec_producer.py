"""
EC イベントプロデューサー

verification/technomart.db の ec_orders / ec_browsing_events を読み込み、
Kafka トピック `ec.events` に送信する。

使い方（バックエンドコンテナ内）:
  python3 -m app.pipelines.producers.ec_producer --sqlite-path /tmp/technomart.db
"""

from __future__ import annotations

import argparse
import logging
import sqlite3
from pathlib import Path

from app.pipelines.producers.base import make_producer, send

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

TOPIC = "ec.events"
try:
    DEFAULT_SQLITE = Path(__file__).parents[6] / "verification" / "technomart.db"
except IndexError:
    DEFAULT_SQLITE = Path("/tmp/technomart.db")


def produce_orders(conn: sqlite3.Connection, producer) -> int:
    rows = conn.execute("""
        SELECT o.order_id, o.ec_user_id, o.ordered_at, o.total_amount, o.status,
               i.ec_product_id, i.quantity, i.unit_price
        FROM ec_orders o
        JOIN ec_order_items i ON o.order_id = i.order_id
    """).fetchall()

    # order_id ごとにアイテムをまとめる
    orders: dict[int, dict] = {}
    for row in rows:
        oid, uid, ordered_at, total, status, pid, qty, price = row
        if oid not in orders:
            orders[oid] = {
                "event_type": "ec_order",
                "order_id": oid,
                "ec_user_id": uid,
                "ordered_at": ordered_at,
                "total_amount": total,
                "status": status,
                "items": [],
            }
        orders[oid]["items"].append({"ec_product_id": pid, "quantity": qty, "unit_price": price})

    for payload in orders.values():
        send(producer, TOPIC, payload)

    return len(orders)


def produce_browse_events(conn: sqlite3.Connection, producer) -> int:
    rows = conn.execute(
        "SELECT event_id, ec_user_id, session_id, ec_product_id, event_type, event_value, timestamp "
        "FROM ec_browsing_events"
    ).fetchall()

    for row in rows:
        event_id, uid, session_id, pid, event_type, event_value, ts = row
        send(producer, TOPIC, {
            "event_type": f"ec_browse_{event_type}",
            "event_id": event_id,
            "ec_user_id": uid,
            "session_id": session_id,
            "ec_product_id": pid,
            "event_value": event_value,
            "timestamp": ts,
        })

    return len(rows)


def main(sqlite_path: Path) -> None:
    if not sqlite_path.exists():
        raise FileNotFoundError(f"SQLite DB が見つかりません: {sqlite_path}")

    log.info(f"SQLite: {sqlite_path}")
    conn = sqlite3.connect(sqlite_path)
    producer = make_producer()

    log.info(f"[{TOPIC}] EC orders 送信中...")
    n_orders = produce_orders(conn, producer)
    log.info(f"  注文: {n_orders} 件")

    log.info(f"[{TOPIC}] EC 閲覧イベント送信中...")
    n_browse = produce_browse_events(conn, producer)
    log.info(f"  閲覧: {n_browse} 件")

    producer.flush()
    producer.close()
    conn.close()
    log.info(f"完了: 合計 {n_orders + n_browse} メッセージ送信")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--sqlite-path", default=str(DEFAULT_SQLITE))
    args = parser.parse_args()
    main(Path(args.sqlite_path))
