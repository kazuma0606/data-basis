"""
Kafka プロデューサー
生成されたCSVを読み込み、各トピックへイベントを投入する。
バッチ投入（本番のリアルタイムストリームとは別物）。
"""
import csv
import json
from pathlib import Path
from kafka import KafkaProducer
from config import KAFKA, DATA_DIR

OUT = Path(DATA_DIR)
BATCH = 500  # 何件ごとにflushするか


def read_csv(name: str) -> list[dict]:
    with open(OUT / name, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def produce(producer: KafkaProducer, topic: str, rows: list[dict], key_field: str):
    for i, row in enumerate(rows, 1):
        producer.send(
            topic,
            key=str(row.get(key_field, i)).encode(),
            value=json.dumps(row, ensure_ascii=False).encode(),
        )
        if i % BATCH == 0:
            producer.flush()
    producer.flush()
    print(f"  {topic:<30} {len(rows):>8,} 件")


def main():
    print("[kafka] 接続中...")
    producer = KafkaProducer(
        bootstrap_servers=KAFKA["bootstrap_servers"],
        acks="all",
        retries=3,
    )

    # ── ec.events（閲覧イベント）────────────────────────
    print("[kafka] ec.events プロデュース中...")
    browses = read_csv("ec_browsing_events.csv")
    ec_events = [
        {
            "event_id":    r["browse_id"],
            "customer_id": r["ec_user_id"],
            "event_type":  r["event_type"],
            "product_id":  f"EC{int(r['ec_product_id']):04d}",
            "event_value": r["event_value"],
            "timestamp":   r["timestamp"],
            "source":      "ec_browse",
        }
        for r in browses
    ]
    # 購買も ec.events に混ぜる
    for o in read_csv("ec_orders.csv"):
        ec_events.append({
            "event_id":    f"ord_{o['order_id']}",
            "customer_id": o["ec_user_id"],
            "event_type":  "purchase",
            "amount":      o["total_amount"],
            "timestamp":   o["ordered_at"],
            "status":      o["status"],
            "source":      "ec_order",
        })
    produce(producer, "ec.events", ec_events, "event_id")

    # ── pos.transactions ─────────────────────────────────
    print("[kafka] pos.transactions プロデュース中...")
    produce(producer, "pos.transactions", read_csv("pos_transactions.csv"), "txn_id")

    # ── app.behaviors ─────────────────────────────────────
    print("[kafka] app.behaviors プロデュース中...")
    produce(producer, "app.behaviors", read_csv("app_events.csv"), "app_event_id")

    # ── inventory.updates（店舗別ダミー在庫変動）─────────
    print("[kafka] inventory.updates プロデュース中...")
    import random
    from src.master_data import PRODUCTS, STORES
    import sys
    sys.path.insert(0, str(Path(__file__).parent.parent.parent / "verification"))
    inventory_rows = []
    for store in STORES:
        for product in PRODUCTS:
            inventory_rows.append({
                "store_id":   store[0],
                "product_id": product[0],
                "stock":      random.randint(0, 50),
                "updated_at": "2026-03-16T00:00:00",
            })
    produce(producer, "inventory.updates", inventory_rows, "product_id")

    producer.close()
    print("[kafka] 完了")


if __name__ == "__main__":
    main()
