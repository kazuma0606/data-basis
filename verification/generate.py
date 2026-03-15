"""
テクノマート Synthetic Data 生成スクリプト

使い方:
    uv run python generate.py
    uv run python generate.py --count 1000  # 人数を変える
"""
import sys
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

import sqlite3
import random
import argparse
import sys
from datetime import datetime
from pathlib import Path

from rich.console import Console
from rich.progress import track
from rich.table import Table
from rich import box

sys.path.insert(0, str(Path(__file__).parent))

from src.schema import SCHEMA
from src.master_data import (
    CATEGORIES, PRODUCTS, CATEGORY_NAMES, PRODUCT_PRICES, STORES
)
from src.dirty import ec_product_code, pos_product_code
from src.customers import generate_true_people, person_to_ec, person_to_pos, person_to_app
from src.events import generate_ec_events, generate_pos_events, generate_app_events

console = Console()
DB_PATH = Path(__file__).parent / 'technomart.db'
RANDOM_SEED = 42


def init_db() -> sqlite3.Connection:
    if DB_PATH.exists():
        DB_PATH.unlink()
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(SCHEMA)
    return conn


def insert_master(conn: sqlite3.Connection) -> None:
    conn.executemany(
        'INSERT INTO master_categories VALUES (?,?,?,?,?)',
        CATEGORIES,
    )
    conn.executemany(
        'INSERT INTO master_products (product_id, category_id, name, brand, price) VALUES (?,?,?,?,?)',
        PRODUCTS,
    )
    conn.executemany(
        'INSERT INTO master_stores (store_id, name, prefecture, city) VALUES (?,?,?,?)',
        STORES,
    )
    conn.commit()


def insert_system_products(conn: sqlite3.Connection) -> None:
    """正マスタからEC/POSの商品テーブルを生成（コード体系と名称を変換）"""
    ec_rows, pos_rows = [], []
    for pid, cat_id, name, brand, price in PRODUCTS:
        cat_name = CATEGORY_NAMES.get(cat_id, '')
        ec_name = f'{brand} {name}' if brand else name
        ec_rows.append((pid, ec_product_code(pid), pid, ec_name, cat_name, price))

        # POS は略称（最初の2単語まで）
        short_name = ' '.join(name.split()[:2])
        pos_rows.append((pid, pos_product_code(pid), pid, short_name, price))

    conn.executemany(
        'INSERT INTO ec_products '
        '(ec_product_id, ec_product_code, master_product_id, name, category_name, price) '
        'VALUES (?,?,?,?,?,?)',
        ec_rows,
    )
    conn.executemany(
        'INSERT INTO pos_products '
        '(pos_product_id, pos_product_code, master_product_id, name, price) '
        'VALUES (?,?,?,?,?)',
        pos_rows,
    )
    conn.commit()


def main(person_count: int) -> None:
    random.seed(RANDOM_SEED)

    console.print(f'\n[bold cyan]テクノマート Synthetic Data 生成[/bold cyan]')
    console.print(f'人数: {person_count} 人 / DB: {DB_PATH}\n')

    conn = init_db()
    insert_master(conn)
    insert_system_products(conn)

    # 各システムの商品ID・店舗IDを取得
    ec_product_ids  = [r[0] for r in conn.execute('SELECT ec_product_id FROM ec_products')]
    pos_product_ids = [r[0] for r in conn.execute('SELECT pos_product_id FROM pos_products')]
    store_ids       = [r[0] for r in conn.execute('SELECT store_id FROM master_stores')]

    # product_prices は ec/pos ともに同じ master_id をキーに参照する
    # events.py に渡す際は master product_id → price のマップを使う
    # ec_product_id = master_product_id なので PRODUCT_PRICES をそのまま使えるが
    # pos_product_id も同様に master_product_id と同じ値で挿入している
    ec_prices  = PRODUCT_PRICES
    pos_prices = PRODUCT_PRICES

    people = generate_true_people(person_count)

    # ─────────────────── バッファ ───────────────────
    ec_customer_buf, pos_member_buf, app_user_buf, link_buf = [], [], [], []
    ec_order_buf, ec_item_buf, ec_browse_buf = [], [], []
    pos_txn_buf, pos_item_buf, pos_visit_buf = [], [], []
    app_event_buf = []

    ec_id = pos_id = order_id = order_item_id = 0
    txn_id = txn_item_id = visit_id = app_event_id = browse_event_id = 0

    for person in track(people, description='顧客・イベントデータ生成中...'):
        reg_dt    = datetime.fromisoformat(person['registered'].isoformat() + 'T00:00:00')
        active_dt = datetime.fromisoformat(person['last_active'].isoformat() + 'T00:00:00')
        churn     = person['churn']

        current_ec_id = current_pos_id = current_uid = None

        # ── EC ──
        if 'ec' in person['systems']:
            ec_id += 1
            row = person_to_ec(person, ec_id)
            ec_customer_buf.append((
                row['ec_user_id'], row['email'], row['name_kanji'], row['name_kana'],
                row['birth_date'], row['phone'], row['prefecture'],
                row['registered_at'], row['last_login_at'], row['is_deleted'],
            ))
            link_buf.append((person['id'], 'ec', str(ec_id), churn))
            current_ec_id = ec_id

        # ── POS ──
        if 'pos' in person['systems']:
            pos_id += 1
            row = person_to_pos(person, pos_id)
            pos_member_buf.append((
                row['member_id'], row['name_kana'],
                row['birth_date_jp'], row['phone'], row['registered_at'],
            ))
            link_buf.append((person['id'], 'pos', str(pos_id), churn))
            current_pos_id = pos_id

        # ── App ──
        if 'app' in person['systems']:
            row = person_to_app(person)
            app_user_buf.append((
                row['uid'], row['phone'], row['name'],
                row['registered_at'], row['push_enabled'],
            ))
            link_buf.append((person['id'], 'app', row['uid'], churn))
            current_uid = row['uid']

        # ── EC イベント ──
        if current_ec_id:
            orders, browses = generate_ec_events(
                current_ec_id, ec_product_ids, ec_prices, churn, reg_dt, active_dt
            )
            for o in orders:
                order_id += 1
                ec_order_buf.append((order_id, o['ec_user_id'], o['ordered_at'],
                                     o['total_amount'], o['status']))
                for it in o['items']:
                    order_item_id += 1
                    ec_item_buf.append((order_item_id, order_id,
                                        it['ec_product_id'], it['quantity'], it['unit_price']))
            for b in browses:
                browse_event_id += 1
                ec_browse_buf.append((browse_event_id, b['ec_user_id'], b['session_id'],
                                      b['ec_product_id'], b['event_type'],
                                      b['event_value'], b['timestamp']))

        # ── POS イベント ──
        if current_pos_id:
            txns, visits = generate_pos_events(
                current_pos_id, pos_product_ids, pos_prices, store_ids, churn, reg_dt, active_dt
            )
            for t in txns:
                txn_id += 1
                pos_txn_buf.append((txn_id, t['member_id'], t['store_id'],
                                    t['transacted_at'], t['total_amount']))
                for it in t['items']:
                    txn_item_id += 1
                    pos_item_buf.append((txn_item_id, txn_id,
                                         it['pos_product_id'], it['quantity'], it['unit_price']))
            for v in visits:
                visit_id += 1
                pos_visit_buf.append((visit_id, v['member_id'], v['store_id'],
                                      v['visited_at'], v['duration_min']))

        # ── App イベント ──
        if current_uid:
            for e in generate_app_events(current_uid, churn, reg_dt, active_dt):
                app_event_id += 1
                app_event_buf.append((app_event_id, e['uid'], e['event_type'],
                                      e['event_value'], e['timestamp']))

    # ─────────────────── 一括書き込み ───────────────────
    console.print('データベースへ書き込み中...')
    conn.executemany('INSERT INTO ec_customers VALUES (?,?,?,?,?,?,?,?,?,?)',   ec_customer_buf)
    conn.executemany('INSERT INTO pos_members VALUES (?,?,?,?,?)',              pos_member_buf)
    conn.executemany('INSERT INTO app_users VALUES (?,?,?,?,?)',                app_user_buf)
    conn.executemany('INSERT INTO _unified_links VALUES (?,?,?,?)',             link_buf)
    conn.executemany('INSERT INTO ec_orders VALUES (?,?,?,?,?)',                ec_order_buf)
    conn.executemany('INSERT INTO ec_order_items VALUES (?,?,?,?,?)',           ec_item_buf)
    conn.executemany('INSERT INTO ec_browsing_events VALUES (?,?,?,?,?,?,?)',   ec_browse_buf)
    conn.executemany('INSERT INTO pos_transactions VALUES (?,?,?,?,?)',         pos_txn_buf)
    conn.executemany('INSERT INTO pos_transaction_items VALUES (?,?,?,?,?)',    pos_item_buf)
    conn.executemany('INSERT INTO pos_store_visits VALUES (?,?,?,?,?)',         pos_visit_buf)
    conn.executemany('INSERT INTO app_events VALUES (?,?,?,?,?)',               app_event_buf)
    conn.commit()

    # ─────────────────── サマリ ───────────────────
    console.print('\n[bold green]完了[/bold green]\n')
    t = Table(box=box.SIMPLE)
    t.add_column('テーブル', style='cyan')
    t.add_column('件数', justify='right')
    for tbl in [
        'master_categories', 'master_products', 'master_stores',
        'ec_customers', 'pos_members', 'app_users',
        'ec_orders', 'ec_order_items', 'ec_browsing_events',
        'pos_transactions', 'pos_transaction_items', 'pos_store_visits',
        'app_events',
    ]:
        count = conn.execute(f'SELECT COUNT(*) FROM {tbl}').fetchone()[0]
        t.add_row(tbl, f'{count:,}')
    console.print(t)
    console.print(f'DB: {DB_PATH}')
    console.print('次のステップ: [bold]uv run python verify.py[/bold]\n')
    conn.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='テクノマート Synthetic Data 生成')
    parser.add_argument('--count', type=int, default=500, help='生成する人数 (default: 500)')
    args = parser.parse_args()
    main(args.count)
