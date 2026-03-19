"""
verification SQLite DB → PostgreSQL staging テーブル 投入スクリプト

使い方（バックエンドコンテナ内で実行）:
  kubectl exec -n technomart deploy/backend -- \
    python3 /app/../../../infrastructure/scripts/seed_staging.py

  # 全件クリアして再投入
  python3 infrastructure/scripts/seed_staging.py --truncate

処理:
  verification/technomart.db の ec_customers / pos_members / app_users を
  PostgreSQL の staging_ec_customers / staging_pos_members / staging_app_users に投入する。
  staging テーブルの既存レコードは TRUNCATE するか ON CONFLICT DO NOTHING でスキップ。
"""

from __future__ import annotations

import argparse
import asyncio
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

import asyncpg

# ── パス設定 ────────────────────────────────────────────────────
# このスクリプトは /technomart/infrastructure/scripts/ に置かれる想定
REPO_ROOT = Path(__file__).parent.parent.parent
SQLITE_PATH = REPO_ROOT / "verification" / "technomart.db"

import os


def parse_dt(s: str | None) -> datetime | None:
    """SQLite の ISO文字列 or None → datetime。"""
    if not s:
        return None
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        return None


PG_CONFIG = {
    "host": os.environ.get("POSTGRES_HOST", "postgresql"),
    "port": int(os.environ.get("POSTGRES_PORT", "5432")),
    "database": os.environ.get("POSTGRES_DB", "technomart"),
    "user": os.environ.get("POSTGRES_USER", "technomart"),
    "password": os.environ.get("POSTGRES_PASSWORD", ""),
}


async def get_pg_conn() -> asyncpg.Connection:
    try:
        return await asyncpg.connect(**PG_CONFIG)
    except Exception as e:
        print(f"PostgreSQL 接続失敗: {e}", file=sys.stderr)
        sys.exit(1)


async def seed_ec(sqlite_conn: sqlite3.Connection, pg: asyncpg.Connection) -> int:
    rows = sqlite_conn.execute(
        "SELECT ec_user_id, email, name_kanji, name_kana, birth_date, phone, prefecture, registered_at "
        "FROM ec_customers"
    ).fetchall()

    inserted = 0
    for row in rows:
        ec_user_id, email, name_kanji, name_kana, birth_date, phone, prefecture, registered_at = row
        try:
            result = await pg.execute(
                """
                INSERT INTO staging_ec_customers
                    (ec_user_id, email, name_kanji, name_kana, birth_date, phone, prefecture, registered_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT DO NOTHING
                """,
                ec_user_id, email, name_kanji, name_kana,
                birth_date, phone, prefecture, parse_dt(registered_at),
            )
            if result != "INSERT 0 0":
                inserted += 1
        except Exception as e:
            print(f"  EC行 {ec_user_id} スキップ: {e}")
    return inserted


async def seed_pos(sqlite_conn: sqlite3.Connection, pg: asyncpg.Connection) -> int:
    rows = sqlite_conn.execute(
        "SELECT member_id, name_kana, birth_date_jp, phone, registered_at FROM pos_members"
    ).fetchall()

    inserted = 0
    for row in rows:
        member_id, name_kana, birth_date_jp, phone, registered_at = row
        try:
            result = await pg.execute(
                """
                INSERT INTO staging_pos_members
                    (member_id, name_kana, birth_date_jp, phone, registered_at)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT DO NOTHING
                """,
                member_id, name_kana, birth_date_jp, phone, parse_dt(registered_at),
            )
            if result != "INSERT 0 0":
                inserted += 1
        except Exception as e:
            print(f"  POS行 {member_id} スキップ: {e}")
    return inserted


async def seed_app(sqlite_conn: sqlite3.Connection, pg: asyncpg.Connection) -> int:
    rows = sqlite_conn.execute(
        "SELECT uid, phone, name, registered_at FROM app_users"
    ).fetchall()

    inserted = 0
    for row in rows:
        uid, phone, name, registered_at = row
        try:
            result = await pg.execute(
                """
                INSERT INTO staging_app_users
                    (uid, phone, name, registered_at)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT DO NOTHING
                """,
                uid, phone, name, parse_dt(registered_at),
            )
            if result != "INSERT 0 0":
                inserted += 1
        except Exception as e:
            print(f"  App行 {uid} スキップ: {e}")
    return inserted


async def main_async(truncate: bool, sqlite_path: Path = SQLITE_PATH) -> None:
    if not sqlite_path.exists():
        print(f"SQLite DB が見つかりません: {sqlite_path}", file=sys.stderr)
        sys.exit(1)

    print(f"SQLite: {sqlite_path}")
    sqlite_conn = sqlite3.connect(sqlite_path)

    pg = await get_pg_conn()
    print("PostgreSQL 接続完了")

    if truncate:
        for tbl in ["staging_ec_customers", "staging_pos_members", "staging_app_users"]:
            await pg.execute(f"TRUNCATE TABLE {tbl} RESTART IDENTITY")
            print(f"  TRUNCATE {tbl}")

    print("\n--- EC customers ---")
    n = await seed_ec(sqlite_conn, pg)
    print(f"  投入: {n} 件")

    print("--- POS members ---")
    n = await seed_pos(sqlite_conn, pg)
    print(f"  投入: {n} 件")

    print("--- App users ---")
    n = await seed_app(sqlite_conn, pg)
    print(f"  投入: {n} 件")

    sqlite_conn.close()
    await pg.close()
    print("\n完了")


def main() -> None:
    parser = argparse.ArgumentParser(description="staging テーブルへのシードデータ投入")
    parser.add_argument("--truncate", action="store_true", help="投入前に staging テーブルを全削除する")
    parser.add_argument(
        "--sqlite-path",
        default=str(SQLITE_PATH),
        help=f"SQLite DB のパス (default: {SQLITE_PATH})",
    )
    args = parser.parse_args()

    asyncio.run(main_async(args.truncate, Path(args.sqlite_path)))


if __name__ == "__main__":
    main()
