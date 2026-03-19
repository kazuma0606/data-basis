"""
生年月日の正規化モジュール

POSシステムは和暦文字列（S55, H15, R3）で年のみ保存する。
ECシステムは西暦 YYYY-MM-DD で保存する。

出力: (date_str: "YYYY-MM-DD", year_only: bool)
  year_only=True の場合、月日は 01-01 で補完されている（マッチング精度が下がる）
"""

from __future__ import annotations

import re
from datetime import date, datetime
from typing import NamedTuple

_ERA_OFFSETS = {
    "R": 2018,  # 令和: 2019年〜 → R1 = 2019
    "H": 1988,  # 平成: 1989年〜 → H1 = 1989
    "S": 1925,  # 昭和: 1926年〜 → S1 = 1926
}
_ERA_PATTERN = re.compile(r"^([RHS])(\d{1,2})$", re.IGNORECASE)
_ISO_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class BirthDateResult(NamedTuple):
    date_str: str | None  # YYYY-MM-DD or None
    year_only: bool  # True の場合、月日は 01-01 で補完


def normalize_birthdate(raw: str | None) -> BirthDateResult:
    """生年月日文字列を YYYY-MM-DD に正規化する。"""
    if not raw:
        return BirthDateResult(None, False)

    raw = raw.strip()

    # 西暦 YYYY-MM-DD
    if _ISO_PATTERN.match(raw):
        return BirthDateResult(raw, False)

    # 西暦年のみ (e.g. "1980")
    if raw.isdigit() and len(raw) == 4:
        return BirthDateResult(f"{raw}-01-01", True)

    # 和暦 (e.g. "S55", "H15", "R3")
    m = _ERA_PATTERN.match(raw)
    if m:
        era, num = m.group(1).upper(), int(m.group(2))
        year = _ERA_OFFSETS[era] + num
        if 1900 <= year <= date.today().year:
            return BirthDateResult(f"{year:04d}-01-01", True)

    return BirthDateResult(None, False)


def birthdate_match(a_raw: str | None, b_raw: str | None) -> bool:
    """2つの生年月日（生または正規化済み）が同一人物と見なせるか判定する。

    POSの和暦（年のみ）は year_only=True となるため、年の一致のみ確認する。
    両方が完全な YYYY-MM-DD の場合は年月日すべて一致を要求する。
    """
    a = normalize_birthdate(a_raw)
    b = normalize_birthdate(b_raw)

    if a.date_str is None or b.date_str is None:
        return False

    if a.year_only or b.year_only:
        # 片方が年のみ → 年だけ比較
        return a.date_str[:4] == b.date_str[:4]

    return a.date_str == b.date_str
