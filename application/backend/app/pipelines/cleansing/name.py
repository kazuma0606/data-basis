"""
氏名の正規化モジュール

システム間の差異:
  EC  : 漢字フルネーム（半角スペース区切り）
  POS : カナ（全角スペース区切り）
  App : 漢字フルネーム or 姓カナのみ（30%の確率）

マッチングには漢字氏名のみ使用する（カナのみはマッチング精度が低いため除外）。
"""

import re
import unicodedata

_KANJI_PATTERN = re.compile(r"[\u4e00-\u9fff\u3400-\u4dbf]")
_KANA_ONLY_PATTERN = re.compile(r"^[\u30A0-\u30FF\u3040-\u309F\s　]+$")


def normalize_name(raw: str | None) -> str | None:
    """氏名を正規化する。全角スペースを半角に変換し、前後をトリムする。"""
    if not raw:
        return None
    # 全角スペース → 半角スペース
    normalized = raw.replace("\u3000", " ").strip()
    # 連続スペースを1つに
    normalized = re.sub(r" {2,}", " ", normalized)
    return normalized if normalized else None


def is_kanji_name(name: str | None) -> bool:
    """漢字を含む氏名かどうかを判定する（カナのみの場合は False）。"""
    if not name:
        return False
    return bool(_KANJI_PATTERN.search(name))


def is_kana_only(name: str | None) -> bool:
    """カナのみの氏名（POSまたはアプリの姓カナのみ）かどうかを判定する。"""
    if not name:
        return False
    return bool(_KANA_ONLY_PATTERN.match(name))


def name_match(a: str | None, b: str | None) -> bool:
    """2つの氏名が一致するか判定する。

    どちらかがカナのみの場合はマッチング対象外（False を返す）。
    漢字氏名同士のみ完全一致比較を行う。
    """
    a_norm = normalize_name(a)
    b_norm = normalize_name(b)

    if not a_norm or not b_norm:
        return False

    # どちらかがカナのみ → マッチング対象外
    if is_kana_only(a_norm) or is_kana_only(b_norm):
        return False

    return a_norm == b_norm
