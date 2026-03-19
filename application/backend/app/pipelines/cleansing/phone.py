"""
電話番号の正規化モジュール

入力パターン（verification/src/dirty.py の dirty_phone() が生成する形式）:
  標準         : 090-1234-5678
  ハイフンなし : 09012345678
  +81形式      : +81-90-1234-5678
  suffix付き   : 090-1234-5678（携帯）
  欠損         : "" or None

出力: XXX-XXXX-XXXX 形式、正規化不能の場合は None
"""

import re

_DIGITS_ONLY = re.compile(r"\D")
_FORMATTED = re.compile(r"^0\d{9,10}$")


def normalize_phone(raw: str | None) -> str | None:
    """電話番号を XXX-XXXX-XXXX 形式に正規化する。正規化不能の場合は None を返す。"""
    if not raw:
        return None

    # suffix（括弧以降）を除去: "090-1234-5678（携帯）" → "090-1234-5678"
    cleaned = re.split(r"[（(]", raw)[0].strip()

    # +81 を 0 に置換: "+81-90-..." → "090-..."
    if cleaned.startswith("+81"):
        cleaned = "0" + cleaned[3:]

    # 数字のみ抽出
    digits = _DIGITS_ONLY.sub("", cleaned)

    # 10 or 11桁、先頭 0 で始まること
    if not (10 <= len(digits) <= 11 and digits.startswith("0")):
        return None

    # 070/080/090 の携帯番号（11桁）: XXX-XXXX-XXXX
    if len(digits) == 11 and digits[:3] in {"070", "080", "090"}:
        return f"{digits[:3]}-{digits[3:7]}-{digits[7:]}"

    # 固定電話（10桁）: XX-XXXX-XXXX
    if len(digits) == 10:
        return f"{digits[:2]}-{digits[2:6]}-{digits[6:]}"

    return None
