"""
汚れデータ生成ヘルパー

現実のレガシーシステムで起きている以下の問題を再現する:
- 電話番号フォーマットの不統一
- 都道府県表記の揺れ
- 和暦/西暦の混在
- 古いメールアドレスの腐敗
- 商品コード体系の差異（EC vs POS）
"""
import random
from datetime import date

PREFECTURE_SHORT = {
    '宮城県': '宮城', '福島県': '福島', '栃木県': '栃木',
    '茨城県': '茨城', '埼玉県': '埼玉', '千葉県': '千葉',
    '東京都': '東京', '神奈川県': '神奈川',
}

PREFECTURE_CODE = {
    '宮城県': '4',  '福島県': '7',  '栃木県': '9',
    '茨城県': '8',  '埼玉県': '11', '千葉県': '12',
    '東京都': '13', '神奈川県': '14',
}

OLD_DOMAINS = ['docomo.ne.jp', 'ezweb.ne.jp', 'softbank.ne.jp', 'i.softbank.jp']


def dirty_phone(clean: str) -> str:
    """090-1234-5678 形式の電話番号にフォーマットのばらつきを加える"""
    r = random.random()
    if r < 0.40:
        return clean                             # 090-1234-5678  (標準)
    elif r < 0.68:
        return clean.replace('-', '')            # 09012345678    (ハイフンなし)
    elif r < 0.78:
        return '+81-' + clean[1:]               # +81-90-1234-5678
    elif r < 0.88:
        return clean + '（携帯）'               # suffix付き
    else:
        return ''                                # 欠損


def dirty_prefecture(pref: str) -> str:
    """都道府県名のフォーマットにばらつきを加える"""
    r = random.random()
    if r < 0.60:
        return pref                              # 東京都   (正式)
    elif r < 0.82:
        return PREFECTURE_SHORT.get(pref, pref)  # 東京     (略称)
    else:
        return PREFECTURE_CODE.get(pref, pref)   # 13       (数字コード)


def to_japanese_era(d: date) -> str:
    """西暦日付を和暦文字列(例: S55, H15, R3)に変換"""
    y = d.year
    if y >= 2019:
        return f'R{y - 2018}'
    elif y >= 1989:
        return f'H{y - 1988}'
    elif y >= 1926:
        return f'S{y - 1925}'
    return str(y)


def dirty_email(email: str, account_age_years: int) -> str:
    """古いアカウントほど無効なメールアドレスになりやすい（バウンス想定）"""
    if account_age_years > 5 and random.random() < 0.25:
        user = email.split('@')[0]
        return f'{user}@{random.choice(OLD_DOMAINS)}'
    return email


def ec_product_code(master_id: int) -> str:
    """正マスタIDからECの商品コードを生成"""
    return f'EC{master_id:04d}'


def pos_product_code(master_id: int) -> str:
    """正マスタIDからPOSの商品コードを生成（プレフィックスが不規則）"""
    prefix = random.choice(['A', 'B', 'C'])
    return f'POS-{prefix}{master_id:04d}'
