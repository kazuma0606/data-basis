"""
名寄せマッチングロジック

マッチングキー優先順位（name_modify_rule.md より）:
  1. メールアドレス（完全一致、大文字小文字無視）
  2. 電話番号（正規化後の完全一致）
  3. 氏名 + 生年月日（漢字氏名同士 + 年月日 or 年のみ）

旧キャリアドメイン（docomo.ne.jp 等）はメール単独マッチの信頼度を下げる。
"""

from __future__ import annotations

from dataclasses import dataclass

from app.pipelines.cleansing.birthdate import birthdate_match
from app.pipelines.cleansing.name import name_match

# 旧キャリアドメイン（信頼度を下げる）
_OLD_CARRIER_DOMAINS = {"docomo.ne.jp", "ezweb.ne.jp", "softbank.ne.jp", "i.softbank.jp"}


@dataclass
class MatchResult:
    matched: bool
    method: str | None  # "email" | "phone" | "name_birthdate" | None
    confidence: float  # 0.0 ~ 1.0


def _is_old_carrier(email: str | None) -> bool:
    if not email or "@" not in email:
        return False
    domain = email.split("@", 1)[1].lower()
    return domain in _OLD_CARRIER_DOMAINS


def match(
    *,
    # 新規レコードのクレンジング済み値
    new_email: str | None,
    new_phone: str | None,
    new_name: str | None,
    new_birthdate: str | None,
    # 既存 unified_customers レコードのクレンジング済み値
    existing_email: str | None,
    existing_phone: str | None,
    existing_name: str | None,
    existing_birthdate: str | None,
) -> MatchResult:
    """新規レコードと既存顧客レコードが同一人物かを判定する。"""

    # ── 1. メールアドレス一致 ──────────────────────────────────
    if new_email and existing_email:
        if new_email.lower() == existing_email.lower():
            is_old = _is_old_carrier(new_email) or _is_old_carrier(existing_email)
            # 旧キャリア同士の一致は信頼度を下げる（他キーで補完推奨）
            confidence = 0.6 if is_old else 0.95
            return MatchResult(matched=True, method="email", confidence=confidence)

    # ── 2. 電話番号一致 ───────────────────────────────────────
    if new_phone and existing_phone:
        if new_phone == existing_phone:
            return MatchResult(matched=True, method="phone", confidence=0.95)

    # ── 3. 氏名 + 生年月日 ────────────────────────────────────
    if name_match(new_name, existing_name) and birthdate_match(new_birthdate, existing_birthdate):
        # 年のみ補完（POSの和暦変換）の場合は信頼度を下げる
        from app.pipelines.cleansing.birthdate import normalize_birthdate
        a_bd = normalize_birthdate(new_birthdate)
        b_bd = normalize_birthdate(existing_birthdate)
        year_only = a_bd.year_only or b_bd.year_only
        confidence = 0.6 if year_only else 0.85
        return MatchResult(matched=True, method="name_birthdate", confidence=confidence)

    return MatchResult(matched=False, method=None, confidence=0.0)
