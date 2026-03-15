"""
仮想顧客の生成

まず「真の人物（unified identity）」を生成し、
各システム（EC / POS / App）に投入するレコードに変換する際に汚れを加える。
"""
import random
import uuid
from datetime import date, timedelta
from faker import Faker

from .dirty import dirty_phone, dirty_prefecture, to_japanese_era, dirty_email

fake = Faker('ja_JP')

# faker ja_JP は last_name_kana() を持たないため独自リストを使用
LAST_NAMES_KANA = [
    'タナカ', 'サトウ', 'スズキ', 'ヤマモト', 'ワタナベ',
    'イトウ', 'コバヤシ', 'ナカムラ', 'オガワ', 'マツモト',
    'キムラ', 'イノウエ', 'ヤマダ', 'ハヤシ', 'サイトウ',
]
FIRST_NAMES_KANA = [
    'ハルト', 'ソウタ', 'レン', 'カイト', 'ユウト',
    'アオイ', 'サクラ', 'リナ', 'ユイ', 'ハナ',
    'ケンジ', 'ヨシコ', 'マサル', 'ミカ', 'タロウ',
]

# ──────────────────────────────────────────────
# チャーン分布: plan の設定に合わせる
#   active 20% / dormant 40% / churned 30% / dead 10%
#   (20万人中: active 4万, dormant 8万, churned 6万, dead 2万)
# ──────────────────────────────────────────────
CHURN_STATUSES = ['active', 'dormant', 'churned', 'dead']
CHURN_WEIGHTS  = [20,       40,        30,        10]

# チャーンステータスごとの「最終アクティブからの経過日数」レンジ
CHURN_RECENCY = {
    'active':  (0,       365),
    'dormant': (366,     3 * 365),
    'churned': (3 * 365, 8 * 365),
    'dead':    (8 * 365, 12 * 365),
}

# ──────────────────────────────────────────────
# どのシステムに存在するかの組み合わせ分布
# ──────────────────────────────────────────────
SYSTEM_COMBOS = [
    (['ec'],               20),
    (['pos'],              15),
    (['app'],              10),
    (['ec', 'pos'],        25),
    (['ec', 'app'],        15),
    (['pos', 'app'],        5),
    (['ec', 'pos', 'app'], 10),
]
SYSTEM_CHOICES = [c[0] for c in SYSTEM_COMBOS]
SYSTEM_WEIGHTS = [c[1] for c in SYSTEM_COMBOS]

TARGET_PREFECTURES = [
    '宮城県', '福島県', '栃木県', '茨城県',
    '埼玉県', '千葉県', '東京都', '神奈川県',
]


def generate_true_people(n: int = 500) -> list[dict]:
    """n 人分の「真の人物情報」を生成する（汚れなし）"""
    people = []
    for i in range(1, n + 1):
        birth_year = random.randint(1955, 2000)
        birth = date(birth_year, random.randint(1, 12), random.randint(1, 28))

        account_age_years = random.randint(1, 10)
        registered = date.today() - timedelta(
            days=account_age_years * 365 + random.randint(0, 180)
        )

        churn = random.choices(CHURN_STATUSES, weights=CHURN_WEIGHTS)[0]
        lo, hi = CHURN_RECENCY[churn]
        last_active = date.today() - timedelta(days=random.randint(lo, hi))
        if last_active <= registered:
            last_active = registered + timedelta(days=random.randint(1, 30))

        phone_clean = (
            f'0{random.choice([70, 80, 90])}-'
            f'{random.randint(1000, 9999)}-'
            f'{random.randint(1000, 9999)}'
        )

        pref = random.choice(TARGET_PREFECTURES)
        systems = random.choices(SYSTEM_CHOICES, weights=SYSTEM_WEIGHTS)[0]

        people.append({
            'id': i,
            'name_kanji':     fake.name(),
            'last_name_kana':  random.choice(LAST_NAMES_KANA),
            'first_name_kana': random.choice(FIRST_NAMES_KANA),
            'email':          fake.email(),
            'phone_clean':    phone_clean,
            'birth':          birth,
            'prefecture':     pref,
            'registered':     registered,
            'last_active':    last_active,
            'churn':          churn,
            'account_age_years': account_age_years,
            'systems':        systems,
        })
    return people


def person_to_ec(person: dict, ec_id: int) -> dict:
    """真の人物 → EC顧客レコード（汚れあり）"""
    return {
        'ec_user_id':    ec_id,
        'email':         dirty_email(person['email'], person['account_age_years']),
        'name_kanji':    person['name_kanji'],
        'name_kana':     f"{person['last_name_kana']} {person['first_name_kana']}",
        'birth_date':    person['birth'].isoformat(),
        'phone':         dirty_phone(person['phone_clean']),
        'prefecture':    dirty_prefecture(person['prefecture']),
        'registered_at': person['registered'].isoformat() + 'T00:00:00',
        'last_login_at': person['last_active'].isoformat() + 'T00:00:00',
        # 退会処理漏れ: チャーン済みでも is_deleted=0 のまま残るケースが多い
        'is_deleted':    0 if random.random() < 0.85 else 1,
    }


def person_to_pos(person: dict, pos_id: int) -> dict:
    """真の人物 → POS会員レコード（汚れあり）"""
    return {
        'member_id':     pos_id,
        'name_kana':     f"{person['last_name_kana']}　{person['first_name_kana']}",  # 全角スペース
        'birth_date_jp': to_japanese_era(person['birth']),   # 和暦
        'phone':         dirty_phone(person['phone_clean']),
        'registered_at': person['registered'].isoformat() + 'T00:00:00',
    }


def person_to_app(person: dict) -> dict:
    """真の人物 → アプリユーザーレコード"""
    return {
        'uid':           str(uuid.uuid4()),
        'phone':         dirty_phone(person['phone_clean']),
        # アプリはカジュアルな名前（フルネームでないこともある）
        'name':          (
            person['name_kanji']
            if random.random() < 0.7
            else person['last_name_kana']
        ),
        'registered_at': person['registered'].isoformat() + 'T00:00:00',
        'push_enabled':  1 if random.random() < 0.6 else 0,
    }
