"""
PostgreSQL 初期データロード
unified_customers / customer_source_map / churn_labels をCSVから一括投入する。
"""
import csv
import psycopg2
from psycopg2.extras import execute_values
from pathlib import Path
from config import POSTGRESQL, DATA_DIR

OUT = Path(DATA_DIR)


def read_csv(name: str) -> list[dict]:
    with open(OUT / name, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def main():
    print("[postgresql] 接続中...")
    conn = psycopg2.connect(**POSTGRESQL)
    cur = conn.cursor()

    # ── unified_customers ──────────────────────────────────
    print("[postgresql] unified_customers ロード中...")
    rows = read_csv("unified_customers.csv")
    execute_values(cur, """
        INSERT INTO unified_customers (id, canonical_name, email, phone, birth_date, prefecture)
        VALUES %s
        ON CONFLICT (id) DO NOTHING
    """, [(r["id"], r["canonical_name"], r["email"], r["phone"],
           r["birth_date"] or None, r["prefecture"]) for r in rows])
    print(f"  {len(rows):,} 件")

    # ── customer_source_map ───────────────────────────────
    print("[postgresql] customer_source_map ロード中...")
    rows = read_csv("customer_source_map.csv")
    execute_values(cur, """
        INSERT INTO customer_source_map (unified_id, source, source_id)
        VALUES %s
        ON CONFLICT DO NOTHING
    """, [(r["unified_id"], r["source"], r["source_id"]) for r in rows])
    print(f"  {len(rows):,} 件")

    # ── churn_labels ──────────────────────────────────────
    print("[postgresql] churn_labels ロード中...")
    rows = read_csv("churn_labels.csv")
    execute_values(cur, """
        INSERT INTO churn_labels (unified_id, label, score)
        VALUES %s
        ON CONFLICT (unified_id) DO UPDATE SET label = EXCLUDED.label, score = EXCLUDED.score
    """, [(r["unified_id"], r["label"], float(r["score"])) for r in rows])
    print(f"  {len(rows):,} 件")

    conn.commit()
    cur.close()
    conn.close()
    print("[postgresql] 完了")


if __name__ == "__main__":
    main()
