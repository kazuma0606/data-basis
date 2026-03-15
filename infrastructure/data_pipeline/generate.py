"""
テクノマート 大規模 Synthetic Data 生成
verification/src/ の生成ロジックを再利用し、CSV として出力する。

使い方（VM内で実行）:
    python generate.py                    # デフォルト 5000人
    python generate.py --customers 10000  # 人数を変える
"""
import sys
import csv
import random
import argparse
import uuid
from datetime import datetime
from pathlib import Path

# verification/ の src を再利用
VERIFICATION_DIR = Path(__file__).parent.parent.parent / "verification"
sys.path.insert(0, str(VERIFICATION_DIR))

from src.master_data import CATEGORIES, PRODUCTS, PRODUCT_PRICES, STORES
from src.dirty import ec_product_code, pos_product_code
from src.customers import generate_true_people, person_to_ec, person_to_pos, person_to_app
from src.events import generate_ec_events, generate_pos_events, generate_app_events

from config import DATA_DIR

RANDOM_SEED = 42
OUT = Path(DATA_DIR)


def write_csv(path: Path, rows: list[dict], fieldnames: list[str]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)
    return len(rows)


def main(customer_count: int) -> None:
    random.seed(RANDOM_SEED)
    print(f"[generate] 開始: {customer_count}人 → {OUT}")

    # ── マスタデータ ──────────────────────────────────────
    ec_product_ids  = [p[0] for p in PRODUCTS]
    pos_product_ids = [p[0] for p in PRODUCTS]
    store_ids       = [s[0] for s in STORES]

    # ── 顧客・イベントバッファ ─────────────────────────────
    unified_buf     = []   # unified_customers
    source_map_buf  = []   # customer_source_map
    churn_buf       = []   # churn_labels
    ec_customers    = []
    pos_members     = []
    app_users       = []
    ec_orders       = []
    ec_order_items  = []
    ec_browses      = []
    pos_txns        = []
    pos_txn_items   = []
    pos_visits      = []
    app_events      = []

    ec_id = pos_id = order_id = item_id = 0
    txn_id = txn_item_id = visit_id = app_ev_id = browse_id = 0

    people = generate_true_people(customer_count)
    print(f"  真の人物を生成しました: {len(people)}人")

    for i, person in enumerate(people, 1):
        if i % 500 == 0:
            print(f"  処理中: {i}/{len(people)}...")

        reg_dt    = datetime.fromisoformat(person["registered"].isoformat() + "T00:00:00")
        active_dt = datetime.fromisoformat(person["last_active"].isoformat() + "T00:00:00")
        churn     = person["churn"]

        # 統合顧客マスタ用 UUID（person.id を seed にして再現可能にする）
        unified_id = str(uuid.UUID(int=person["id"] + RANDOM_SEED * 10**12))

        unified_buf.append({
            "id":             unified_id,
            "canonical_name": person["name_kanji"],
            "email":          person["email"],
            "phone":          person["phone_clean"],
            "birth_date":     person["birth"].isoformat(),
            "prefecture":     person["prefecture"],
        })

        churn_score = {
            "active":  random.uniform(0.0, 0.2),
            "dormant": random.uniform(0.2, 0.5),
            "churned": random.uniform(0.5, 0.85),
            "dead":    random.uniform(0.85, 1.0),
        }[churn]

        churn_buf.append({
            "unified_id": unified_id,
            "label":      churn,
            "score":      round(churn_score, 4),
        })

        cur_ec_id = cur_pos_id = cur_uid = None

        # ── EC ──────────────────────────────────────────
        if "ec" in person["systems"]:
            ec_id += 1
            r = person_to_ec(person, ec_id)
            ec_customers.append({**r, "ec_user_id": ec_id})
            source_map_buf.append({
                "unified_id": unified_id,
                "source":     "ec",
                "source_id":  str(ec_id),
            })
            cur_ec_id = ec_id

        # ── POS ─────────────────────────────────────────
        if "pos" in person["systems"]:
            pos_id += 1
            r = person_to_pos(person, pos_id)
            pos_members.append({**r, "member_id": pos_id})
            source_map_buf.append({
                "unified_id": unified_id,
                "source":     "pos",
                "source_id":  str(pos_id),
            })
            cur_pos_id = pos_id

        # ── App ─────────────────────────────────────────
        if "app" in person["systems"]:
            r = person_to_app(person)
            app_users.append(r)
            source_map_buf.append({
                "unified_id": unified_id,
                "source":     "app",
                "source_id":  r["uid"],
            })
            cur_uid = r["uid"]

        # ── EC イベント ──────────────────────────────────
        if cur_ec_id:
            orders, browses = generate_ec_events(
                cur_ec_id, ec_product_ids, PRODUCT_PRICES, churn, reg_dt, active_dt
            )
            for o in orders:
                order_id += 1
                ec_orders.append({
                    "order_id":    order_id,
                    "ec_user_id":  o["ec_user_id"],
                    "ordered_at":  o["ordered_at"],
                    "total_amount": o["total_amount"],
                    "status":      o["status"],
                })
                for it in o["items"]:
                    item_id += 1
                    ec_order_items.append({
                        "item_id":       item_id,
                        "order_id":      order_id,
                        "ec_product_id": it["ec_product_id"],
                        "quantity":      it["quantity"],
                        "unit_price":    it["unit_price"],
                    })
            for b in browses:
                browse_id += 1
                ec_browses.append({
                    "browse_id":    browse_id,
                    "ec_user_id":   b["ec_user_id"],
                    "session_id":   b["session_id"],
                    "ec_product_id": b["ec_product_id"],
                    "event_type":   b["event_type"],
                    "event_value":  b["event_value"],
                    "timestamp":    b["timestamp"],
                })

        # ── POS イベント ─────────────────────────────────
        if cur_pos_id:
            txns, visits = generate_pos_events(
                cur_pos_id, pos_product_ids, PRODUCT_PRICES, store_ids, churn, reg_dt, active_dt
            )
            for t in txns:
                txn_id += 1
                pos_txns.append({
                    "txn_id":       txn_id,
                    "member_id":    t["member_id"],
                    "store_id":     t["store_id"],
                    "transacted_at": t["transacted_at"],
                    "total_amount": t["total_amount"],
                })
                for it in t["items"]:
                    txn_item_id += 1
                    pos_txn_items.append({
                        "item_id":        txn_item_id,
                        "txn_id":         txn_id,
                        "pos_product_id": it["pos_product_id"],
                        "quantity":       it["quantity"],
                        "unit_price":     it["unit_price"],
                    })
            for v in visits:
                visit_id += 1
                pos_visits.append({
                    "visit_id":    visit_id,
                    "member_id":   v["member_id"],
                    "store_id":    v["store_id"],
                    "visited_at":  v["visited_at"],
                    "duration_min": v["duration_min"],
                })

        # ── App イベント ─────────────────────────────────
        if cur_uid:
            for e in generate_app_events(cur_uid, churn, reg_dt, active_dt):
                app_ev_id += 1
                app_events.append({
                    "app_event_id": app_ev_id,
                    "uid":          e["uid"],
                    "event_type":   e["event_type"],
                    "event_value":  e["event_value"],
                    "timestamp":    e["timestamp"],
                })

    # ── CSV 出力 ─────────────────────────────────────────
    print("\n[generate] CSV 出力中...")
    results = [
        write_csv(OUT/"unified_customers.csv", unified_buf,
                  ["id","canonical_name","email","phone","birth_date","prefecture"]),
        write_csv(OUT/"customer_source_map.csv", source_map_buf,
                  ["unified_id","source","source_id"]),
        write_csv(OUT/"churn_labels.csv", churn_buf,
                  ["unified_id","label","score"]),
        write_csv(OUT/"ec_customers.csv", ec_customers,
                  ["ec_user_id","email","name_kanji","name_kana","birth_date","phone","prefecture","registered_at","last_login_at","is_deleted"]),
        write_csv(OUT/"pos_members.csv", pos_members,
                  ["member_id","name_kana","birth_date_jp","phone","registered_at"]),
        write_csv(OUT/"app_users.csv", app_users,
                  ["uid","phone","name","registered_at","push_enabled"]),
        write_csv(OUT/"ec_orders.csv", ec_orders,
                  ["order_id","ec_user_id","ordered_at","total_amount","status"]),
        write_csv(OUT/"ec_order_items.csv", ec_order_items,
                  ["item_id","order_id","ec_product_id","quantity","unit_price"]),
        write_csv(OUT/"ec_browsing_events.csv", ec_browses,
                  ["browse_id","ec_user_id","session_id","ec_product_id","event_type","event_value","timestamp"]),
        write_csv(OUT/"pos_transactions.csv", pos_txns,
                  ["txn_id","member_id","store_id","transacted_at","total_amount"]),
        write_csv(OUT/"pos_transaction_items.csv", pos_txn_items,
                  ["item_id","txn_id","pos_product_id","quantity","unit_price"]),
        write_csv(OUT/"pos_store_visits.csv", pos_visits,
                  ["visit_id","member_id","store_id","visited_at","duration_min"]),
        write_csv(OUT/"app_events.csv", app_events,
                  ["app_event_id","uid","event_type","event_value","timestamp"]),
    ]

    print("\n[generate] 完了")
    labels = [
        "unified_customers", "customer_source_map", "churn_labels",
        "ec_customers", "pos_members", "app_users",
        "ec_orders", "ec_order_items", "ec_browsing_events",
        "pos_transactions", "pos_transaction_items", "pos_store_visits",
        "app_events",
    ]
    for label, count in zip(labels, results):
        print(f"  {label:<30} {count:>8,} 件")
    print(f"\n出力先: {OUT}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="テクノマート Synthetic Data 生成")
    parser.add_argument("--customers", type=int, default=5000, help="生成する顧客数 (default: 5000)")
    args = parser.parse_args()
    main(args.customers)
