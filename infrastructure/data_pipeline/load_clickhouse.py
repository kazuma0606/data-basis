"""
ClickHouse 初期データロード
ec_events / pos_transactions / customer_scores_daily をCSVから投入する。
"""
import csv
from pathlib import Path
from datetime import datetime
import clickhouse_connect
from config import CLICKHOUSE, DATA_DIR

OUT = Path(DATA_DIR)


def read_csv(name: str) -> list[dict]:
    with open(OUT / name, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def parse_dt(s: str):
    """ISO文字列 → (Date, DateTime)"""
    dt = datetime.fromisoformat(s)
    return dt.date(), dt


def main():
    print("[clickhouse] 接続中...")
    client = clickhouse_connect.get_client(**CLICKHOUSE)

    # ── ec_events（閲覧イベント + 購買イベントを統合）────────
    print("[clickhouse] ec_events ロード中...")

    rows = []

    # 閲覧イベント（ec_browsing_events.csv）
    for r in read_csv("ec_browsing_events.csv"):
        d, dt = parse_dt(r["timestamp"])
        rows.append({
            "event_id":    r["browse_id"],
            "customer_id": r["ec_user_id"],
            "event_type":  r["event_type"],
            "product_id":  f"EC{int(r['ec_product_id']):04d}",
            "amount":      None,
            "event_date":  d,
            "event_time":  dt,
        })

    # 購買イベント（ec_orders.csv + ec_order_items.csv でフラット化）
    order_items: dict[str, list] = {}
    for it in read_csv("ec_order_items.csv"):
        order_items.setdefault(it["order_id"], []).append(it)

    for o in read_csv("ec_orders.csv"):
        d, dt = parse_dt(o["ordered_at"])
        for it in order_items.get(o["order_id"], []):
            rows.append({
                "event_id":    f"ord_{o['order_id']}_{it['item_id']}",
                "customer_id": o["ec_user_id"],
                "event_type":  "purchase",
                "product_id":  f"EC{int(it['ec_product_id']):04d}",
                "amount":      float(it["unit_price"]) * int(it["quantity"]),
                "event_date":  d,
                "event_time":  dt,
            })

    if rows:
        client.insert("technomart.ec_events",
                      [[r["event_id"], r["customer_id"], r["event_type"],
                        r["product_id"], r["amount"], r["event_date"], r["event_time"]]
                       for r in rows],
                      column_names=["event_id","customer_id","event_type",
                                    "product_id","amount","event_date","event_time"])
    print(f"  {len(rows):,} 件")

    # ── pos_transactions ──────────────────────────────────
    print("[clickhouse] pos_transactions ロード中...")

    txn_items: dict[str, list] = {}
    for it in read_csv("pos_transaction_items.csv"):
        txn_items.setdefault(it["txn_id"], []).append(it)

    pos_rows = []
    for t in read_csv("pos_transactions.csv"):
        d, dt = parse_dt(t["transacted_at"])
        for it in txn_items.get(t["txn_id"], []):
            pos_rows.append([
                f"pos_{t['txn_id']}_{it['item_id']}",  # txn_id
                str(t["member_id"]),                     # customer_id
                str(t["store_id"]),                      # store_id
                f"POS-{it['pos_product_id']}",           # product_id
                int(it["quantity"]),
                float(it["unit_price"]) * int(it["quantity"]),
                d,
                dt,
            ])

    if pos_rows:
        client.insert("technomart.pos_transactions", pos_rows,
                      column_names=["txn_id","customer_id","store_id","product_id",
                                    "quantity","amount","txn_date","txn_time"])
    print(f"  {len(pos_rows):,} 件")

    print("[clickhouse] 完了")


if __name__ == "__main__":
    main()
