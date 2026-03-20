"""
都道府県コードの正規化モジュール

入力パターン（verification/src/dirty.py の dirty_prefecture() が生成する形式）:
  正式名称: 東京都 / 神奈川県
  略称    : 東京  / 神奈川
  数字コード: 13  / 14

対象8都県（テクノマート営業エリア）のみ。
それ以外は None を返す。
"""

# JISコード → 正式名称
_CODE_TO_OFFICIAL: dict[str, str] = {
    "4": "宮城県",
    "7": "福島県",
    "9": "栃木県",
    "8": "茨城県",
    "11": "埼玉県",
    "12": "千葉県",
    "13": "東京都",
    "14": "神奈川県",
}

# 略称 → 正式名称
_SHORT_TO_OFFICIAL: dict[str, str] = {
    "宮城": "宮城県",
    "福島": "福島県",
    "栃木": "栃木県",
    "茨城": "茨城県",
    "埼玉": "埼玉県",
    "千葉": "千葉県",
    "東京": "東京都",
    "神奈川": "神奈川県",
}

# 正式名称のセット
_OFFICIAL = set(_CODE_TO_OFFICIAL.values())


def normalize_prefecture(raw: str | None) -> str | None:
    """都道府県表記を正式名称に正規化する。認識不能の場合は None を返す。"""
    if not raw:
        return None

    v = raw.strip()

    # 正式名称
    if v in _OFFICIAL:
        return v

    # 数字コード
    if v in _CODE_TO_OFFICIAL:
        return _CODE_TO_OFFICIAL[v]

    # 略称
    if v in _SHORT_TO_OFFICIAL:
        return _SHORT_TO_OFFICIAL[v]

    return None
