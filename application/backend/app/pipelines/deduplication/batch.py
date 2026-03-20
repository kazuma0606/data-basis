"""
名寄せバッチエントリポイント

使い方:
  python -m app.pipelines.deduplication.batch --mode full
  python -m app.pipelines.deduplication.batch --mode incremental

モード:
  full        : staging テーブルの未処理レコード全件を対象に名寄せを実行
  incremental : 前回実行以降の未処理レコードのみ処理（デフォルト）

処理フロー:
  staging_ec_customers / staging_pos_members / staging_app_users
    → クレンジング（phone / birthdate / prefecture / name）
    → unified_customers との照合（matcher.py）
    → マッチ: customer_id_map に対応関係を追加
    → 非マッチ: unified_customers に新規レコードを INSERT
    → pipeline_jobs に実行ログを記録
"""

from __future__ import annotations

import argparse
import asyncio
import logging
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.infrastructure.database.models import (
    CustomerIdMapModel,
    PipelineJobModel,
    StagingAppUserModel,
    StagingEcCustomerModel,
    StagingPosMemberModel,
    UnifiedCustomerModel,
)
from app.pipelines.cleansing.birthdate import normalize_birthdate
from app.pipelines.cleansing.name import normalize_name
from app.pipelines.cleansing.phone import normalize_phone
from app.pipelines.cleansing.prefecture import normalize_prefecture
from app.pipelines.deduplication.matcher import match as do_match

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

NOW = datetime.now(UTC).replace(tzinfo=None)


# ── クレンジング済み中間表現 ───────────────────────────────────────


class CleanedRecord:
    def __init__(
        self,
        source: str,  # "ec" | "pos" | "app"
        source_id: str,
        name: str | None,
        name_kana: str | None,
        email: str | None,
        phone: str | None,
        birth_date: str | None,
        birth_year_only: bool,
        prefecture: str | None,
        registered_at: datetime | None,
        staging_row_id: int,
    ):
        self.source = source
        self.source_id = source_id
        self.name = name
        self.name_kana = name_kana
        self.email = email
        self.phone = phone
        self.birth_date = birth_date
        self.birth_year_only = birth_year_only
        self.prefecture = prefecture
        self.registered_at = registered_at
        self.staging_row_id = staging_row_id


# ── クレンジング処理 ─────────────────────────────────────────────


def clean_ec(row: StagingEcCustomerModel) -> CleanedRecord:
    bd = normalize_birthdate(row.birth_date)
    return CleanedRecord(
        source="ec",
        source_id=str(row.ec_user_id),
        name=normalize_name(row.name_kanji),
        name_kana=normalize_name(row.name_kana),
        email=(row.email or "").strip().lower() or None,
        phone=normalize_phone(row.phone),
        birth_date=bd.date_str,
        birth_year_only=bd.year_only,
        prefecture=normalize_prefecture(row.prefecture),
        registered_at=row.registered_at,
        staging_row_id=row.id,
    )


def clean_pos(row: StagingPosMemberModel) -> CleanedRecord:
    bd = normalize_birthdate(row.birth_date_jp)
    return CleanedRecord(
        source="pos",
        source_id=str(row.member_id),
        name=None,  # POSは漢字氏名を持たない
        name_kana=normalize_name(row.name_kana),
        email=None,
        phone=normalize_phone(row.phone),
        birth_date=bd.date_str,
        birth_year_only=bd.year_only,
        prefecture=None,
        registered_at=row.registered_at,
        staging_row_id=row.id,
    )


def clean_app(row: StagingAppUserModel) -> CleanedRecord:
    from app.pipelines.cleansing.name import is_kana_only

    raw_name = normalize_name(row.name)
    # カナのみ（姓のみ）はマッチングには使わない
    name = None if is_kana_only(raw_name) else raw_name
    return CleanedRecord(
        source="app",
        source_id=row.uid,
        name=name,
        name_kana=raw_name if is_kana_only(raw_name) else None,
        email=None,
        phone=normalize_phone(row.phone),
        birth_date=None,
        birth_year_only=False,
        prefecture=None,
        registered_at=row.registered_at,
        staging_row_id=row.id,
    )


# ── DB 操作 ─────────────────────────────────────────────────────


async def load_unified_customers(session: AsyncSession) -> list[dict[str, Any]]:
    """unified_customers を全件ロードしてマッチング用辞書のリストを返す。"""
    result = await session.execute(
        select(
            UnifiedCustomerModel.unified_id,
            UnifiedCustomerModel.name_kanji,
            UnifiedCustomerModel.email,
            UnifiedCustomerModel.phone,
            UnifiedCustomerModel.birth_date,
        )
    )
    rows = result.fetchall()
    return [
        {
            "unified_id": r.unified_id,
            "name": r.name_kanji,
            "email": (r.email or "").lower() or None,
            "phone": r.phone,
            "birth_date": r.birth_date.isoformat() if r.birth_date else None,
        }
        for r in rows
    ]


async def already_mapped(session: AsyncSession, source: str, source_id: str) -> int | None:
    """customer_id_map に既にマッピングが存在する場合、unified_id を返す。"""
    result = await session.execute(
        select(CustomerIdMapModel.unified_id).where(
            CustomerIdMapModel.source_system == source,
            CustomerIdMapModel.source_id == source_id,
        )
    )
    row = result.first()
    return row[0] if row else None


async def insert_unified(session: AsyncSession, rec: CleanedRecord) -> int:
    """unified_customers に新規レコードを INSERT し unified_id を返す。"""
    # birth_date 文字列 → date オブジェクト
    from datetime import date as DateType

    bd = None
    if rec.birth_date:
        try:
            bd = DateType.fromisoformat(rec.birth_date)
        except ValueError:
            bd = None

    obj = UnifiedCustomerModel(
        name_kanji=rec.name,
        name_kana=rec.name_kana,
        email=rec.email,
        phone=rec.phone,
        birth_date=bd,
        prefecture=rec.prefecture,
        resolution_score=None,
        created_at=NOW,
        updated_at=NOW,
    )
    session.add(obj)
    await session.flush()  # unified_id を取得するために flush
    return int(obj.unified_id)


async def insert_mapping(
    session: AsyncSession,
    unified_id: int,
    source: str,
    source_id: str,
    method: str | None,
) -> None:
    """customer_id_map に対応関係を追加する。重複は無視する。"""
    existing = await already_mapped(session, source, source_id)
    if existing is not None:
        return

    obj = CustomerIdMapModel(
        unified_id=unified_id,
        source_system=source,
        source_id=source_id,
        match_method=method,
        matched_at=NOW,
    )
    session.add(obj)


async def mark_staging_processed(
    session: AsyncSession,
    model_cls: type[Any],
    row_id: int,
) -> None:
    await session.execute(
        update(model_cls).where(model_cls.id == row_id).values(processed=True, processed_at=NOW)
    )


# ── バッチメイン ─────────────────────────────────────────────────


async def run_batch(mode: str) -> None:
    engine = create_async_engine(settings.postgres_url, echo=False)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async with factory() as session:
        # pipeline_jobs に開始ログを記録
        job = PipelineJobModel(
            job_name=f"deduplication_{mode}",
            status="running",
            started_at=NOW,
        )
        session.add(job)
        await session.flush()
        job_id = job.id

        processed = 0
        matched = 0
        created = 0
        errors = 0

        try:
            # 既存の unified_customers を全件メモリにロード（照合用）
            log.info("unified_customers を読み込み中...")
            existing_customers = await load_unified_customers(session)
            log.info(f"  {len(existing_customers)} 件の既存顧客を読み込みました")

            # 各ステージングテーブルから未処理レコードを取得
            staging_sources: list[tuple[str, type[Any], Callable[..., Any]]] = [
                ("ec", StagingEcCustomerModel, clean_ec),
                ("pos", StagingPosMemberModel, clean_pos),
                ("app", StagingAppUserModel, clean_app),
            ]

            for source_name, model_cls, cleaner in staging_sources:
                q = select(model_cls).where(model_cls.processed.is_(False))
                result = await session.execute(q)
                rows = result.scalars().all()

                log.info(f"[{source_name.upper()}] {len(rows)} 件の未処理レコードを処理します")

                for row in rows:
                    try:
                        rec = cleaner(row)
                        processed += 1

                        # 既存マッピングを確認
                        existing_uid = await already_mapped(session, rec.source, rec.source_id)
                        if existing_uid is not None:
                            await mark_staging_processed(session, model_cls, rec.staging_row_id)
                            continue

                        # 既存 unified_customers との照合
                        matched_uid: int | None = None
                        match_method: str | None = None

                        for existing in existing_customers:
                            match_result = do_match(
                                new_email=rec.email,
                                new_phone=rec.phone,
                                new_name=rec.name,
                                new_birthdate=rec.birth_date,
                                existing_email=existing["email"],
                                existing_phone=existing["phone"],
                                existing_name=existing["name"],
                                existing_birthdate=existing["birth_date"],
                            )
                            if match_result.matched:
                                matched_uid = existing["unified_id"]
                                match_method = match_result.method
                                break

                        if matched_uid is not None:
                            # マッチ → 対応関係を追加
                            await insert_mapping(
                                session, matched_uid, rec.source, rec.source_id, match_method
                            )
                            matched += 1
                        else:
                            # 非マッチ → 新規顧客として登録
                            new_uid = await insert_unified(session, rec)
                            await insert_mapping(session, new_uid, rec.source, rec.source_id, "new")
                            # メモリ上の既存顧客リストに追加（後続レコードのマッチング対象）
                            existing_customers.append(
                                {
                                    "unified_id": new_uid,
                                    "name": rec.name,
                                    "email": rec.email,
                                    "phone": rec.phone,
                                    "birth_date": rec.birth_date,
                                }
                            )
                            created += 1

                        await mark_staging_processed(session, model_cls, rec.staging_row_id)

                    except Exception as e:
                        log.error(f"  レコード処理エラー ({source_name} id={row.id}): {e}")
                        errors += 1

            # pipeline_jobs を完了に更新
            await session.execute(
                update(PipelineJobModel)
                .where(PipelineJobModel.id == job_id)
                .values(
                    status="success",
                    finished_at=datetime.now(UTC).replace(tzinfo=None),
                    records_processed=processed,
                )
            )
            await session.commit()

        except Exception as e:
            await session.execute(
                update(PipelineJobModel)
                .where(PipelineJobModel.id == job_id)
                .values(
                    status="failed",
                    finished_at=datetime.now(UTC).replace(tzinfo=None),
                    error_message=str(e)[:500],
                )
            )
            await session.commit()
            raise

    log.info(f"バッチ完了: 処理={processed} マッチ={matched} 新規={created} エラー={errors}")

    await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description="名寄せバッチ")
    parser.add_argument(
        "--mode",
        choices=["full", "incremental"],
        default="incremental",
        help="full: 全件処理 / incremental: 未処理のみ（デフォルト）",
    )
    args = parser.parse_args()
    asyncio.run(run_batch(args.mode))


if __name__ == "__main__":
    main()
