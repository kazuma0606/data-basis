"""
POS トランザクションプロデューサー

verification/technomart.db の pos_transactions / pos_store_visits を読み込み、
Kafka トピック `pos.transactions` に送信する。

使い方（バックエンドコンテナ内）:
  python3 -m app.pipelines.producers.pos_producer --sqlite-path /tmp/technomart.db
"""

from __future__ import annotations

import argparse
import logging
import sqlite3
from pathlib import Path

from app.pipelines.producers.base import make_producer, send

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

TOPIC = "pos.transactions"
try:
    DEFAULT_SQLITE = Path(__file__).parents[6] / "verification" / "technomart.db"
except IndexError:
    DEFAULT_SQLITE = Path("/tmp/technomart.db")


def produce_transactions(conn: sqlite3.Connection, producer) -> int:
    rows = conn.execute("""
        SELECT t.transaction_id, t.member_id, t.store_id, t.transacted_at, t.total_amount,
               i.pos_product_id, i.quantity, i.unit_price
        FROM pos_transactions t
        JOIN pos_transaction_items i ON t.transaction_id = i.transaction_id
    """).fetchall()

    txns: dict[int, dict] = {}
    for row in rows:
        tid, mid, sid, ts, total, pid, qty, price = row
        if tid not in txns:
            txns[tid] = {
                "event_type": "pos_transaction",
                "transaction_id": tid,
                "member_id": mid,
                "store_id": sid,
                "transacted_at": ts,
                "total_amount": total,
                "items": [],
            }
        txns[tid]["items"].append({"pos_product_id": pid, "quantity": qty, "unit_price": price})

    for payload in txns.values():
        send(producer, TOPIC, payload)

    return len(txns)


def produce_store_visits(conn: sqlite3.Connection, producer) -> int:
    rows = conn.execute(
        "SELECT visit_id, member_id, store_id, visited_at, duration_min FROM pos_store_visits"
    ).fetchall()

    for row in rows:
        vid, mid, sid, visited_at, duration = row
        send(
            producer,
            TOPIC,
            {
                "event_type": "pos_store_visit",
                "visit_id": vid,
                "member_id": mid,
                "store_id": sid,
                "visited_at": visited_at,
                "duration_min": duration,
            },
        )

    return len(rows)


def main(sqlite_path: Path) -> None:
    if not sqlite_path.exists():
        raise FileNotFoundError(f"SQLite DB が見つかりません: {sqlite_path}")

    log.info(f"SQLite: {sqlite_path}")
    conn = sqlite3.connect(sqlite_path)
    producer = make_producer()

    log.info(f"[{TOPIC}] POS トランザクション送信中...")
    n_txn = produce_transactions(conn, producer)
    log.info(f"  トランザクション: {n_txn} 件")

    log.info(f"[{TOPIC}] 来店記録送信中...")
    n_visit = produce_store_visits(conn, producer)
    log.info(f"  来店: {n_visit} 件")

    producer.flush()
    producer.close()
    conn.close()
    log.info(f"完了: 合計 {n_txn + n_visit} メッセージ送信")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--sqlite-path", default=str(DEFAULT_SQLITE))
    args = parser.parse_args()
    main(Path(args.sqlite_path))
