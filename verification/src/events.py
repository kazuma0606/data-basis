"""
購買・行動イベントの生成

チャーンステータスに応じて購買回数・行動ログ量を変える。
弱いシグナル（page_view, scroll）と強いシグナル（cart_add, wishlist_add）を混在させる。
"""
import random
import uuid
from datetime import datetime, timedelta

# ──────────────────────────────────────────────
# チャーンステータスごとの購買回数レンジ
# ──────────────────────────────────────────────
PURCHASE_COUNTS = {
    'active':  (3, 15),
    'dormant': (1,  5),
    'churned': (0,  3),
    'dead':    (0,  1),
}

BROWSE_COUNTS = {
    'active':  (10, 50),
    'dormant': ( 2, 10),
    'churned': ( 0,  5),
    'dead':    ( 0,  2),
}

# 弱い/強いシグナルを混在させたイベント種別と出現重み
BROWSE_EVENT_TYPES = [
    ('page_view',        40),   # 弱
    ('scroll_milestone', 20),   # 弱
    ('image_click',      15),   # 中
    ('spec_expand',       8),   # 中
    ('review_read',       7),   # 中
    ('cart_add',          5),   # 強
    ('wishlist_add',      3),   # 強
    ('product_compare',   2),   # 強
]
BROWSE_TYPES   = [e[0] for e in BROWSE_EVENT_TYPES]
BROWSE_WEIGHTS = [e[1] for e in BROWSE_EVENT_TYPES]

APP_EVENT_TYPES = [
    'app_open', 'category_browse', 'product_view', 'search', 'notification_open',
]

ORDER_STATUSES = ['completed', 'completed', 'completed', 'cancelled', 'returned']
ORDER_WEIGHTS  = [70, 70, 70, 10, 5]


def _random_dt(start: datetime, end: datetime) -> datetime:
    if end <= start:
        return start
    delta = int((end - start).total_seconds())
    return start + timedelta(seconds=random.randint(0, delta))


def generate_ec_events(
    ec_user_id: int,
    ec_product_ids: list[int],
    product_prices: dict[int, int],
    churn: str,
    registered: datetime,
    last_active: datetime,
) -> tuple[list[dict], list[dict]]:
    """EC の注文・明細と閲覧イベントを生成する。

    Returns:
        orders: [{ec_user_id, ordered_at, total_amount, status, items: [...]}, ...]
        browses: [{ec_user_id, session_id, ec_product_id, event_type, event_value, timestamp}, ...]
    """
    orders = []
    browses = []

    n_purchases = random.randint(*PURCHASE_COUNTS[churn])
    n_browse    = random.randint(*BROWSE_COUNTS[churn])

    for _ in range(n_purchases):
        pid = random.choice(ec_product_ids)
        qty = random.randint(1, 2)
        price = product_prices.get(pid, 10000)
        orders.append({
            'ec_user_id':   ec_user_id,
            'ordered_at':   _random_dt(registered, last_active).isoformat(),
            'total_amount': price * qty,
            'status':       random.choices(ORDER_STATUSES, weights=ORDER_WEIGHTS)[0],
            'items': [{'ec_product_id': pid, 'quantity': qty, 'unit_price': price}],
        })

    session_id = str(uuid.uuid4())
    for _ in range(n_browse):
        if random.random() < 0.1:   # 10% の確率でセッション切り替え
            session_id = str(uuid.uuid4())
        event_type = random.choices(BROWSE_TYPES, weights=BROWSE_WEIGHTS)[0]
        event_value = ''
        if event_type == 'scroll_milestone':
            event_value = str(random.choice([25, 50, 75, 100]))
        elif event_type == 'image_click':
            event_value = str(random.randint(1, 5))
        browses.append({
            'ec_user_id':   ec_user_id,
            'session_id':   session_id,
            'ec_product_id': random.choice(ec_product_ids),
            'event_type':   event_type,
            'event_value':  event_value,
            'timestamp':    _random_dt(registered, last_active).isoformat(),
        })

    return orders, browses


def generate_pos_events(
    member_id: int,
    pos_product_ids: list[int],
    product_prices: dict[int, int],
    store_ids: list[int],
    churn: str,
    registered: datetime,
    last_active: datetime,
) -> tuple[list[dict], list[dict]]:
    """POS の取引・明細と来店記録を生成する。

    Returns:
        transactions: [{member_id, store_id, transacted_at, total_amount, items: [...]}, ...]
        visits: [{member_id, store_id, visited_at, duration_min}, ...]
    """
    transactions = []
    visits = []

    n_purchases = random.randint(*PURCHASE_COUNTS[churn])

    for _ in range(n_purchases):
        pid = random.choice(pos_product_ids)
        qty = random.randint(1, 2)
        price = product_prices.get(pid, 10000)
        store_id = random.choice(store_ids)
        transacted_at = _random_dt(registered, last_active)

        transactions.append({
            'member_id':    member_id,
            'store_id':     store_id,
            'transacted_at': transacted_at.isoformat(),
            'total_amount': price * qty,
            'items': [{'pos_product_id': pid, 'quantity': qty, 'unit_price': price}],
        })
        visits.append({
            'member_id':    member_id,
            'store_id':     store_id,
            'visited_at':   transacted_at.isoformat(),
            'duration_min': random.randint(15, 120),
        })

    return transactions, visits


def generate_app_events(
    uid: str,
    churn: str,
    registered: datetime,
    last_active: datetime,
) -> list[dict]:
    n = random.randint(*BROWSE_COUNTS[churn])
    return [
        {
            'uid':        uid,
            'event_type': random.choice(APP_EVENT_TYPES),
            'event_value': '',
            'timestamp':  _random_dt(registered, last_active).isoformat(),
        }
        for _ in range(n)
    ]
