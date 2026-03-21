"""
スコアリングバッチ ランナー

全4スコアを計算して customer_scores テーブルに書き込む。

使い方（バックエンドコンテナ内）:
  python3 -m app.scoring.runner [--mode daily|weekly|full]

  daily  : category_affinity のみ（デフォルト）
  weekly : churn_risk / purchase_timing / visit_prediction のみ
  full   : 全スコア（初回実行・手動実行用）

運用:
  Kubernetes CronJob として定期実行する。
  - 日次 CronJob: --mode daily
  - 週次 CronJob: --mode weekly
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import math
from collections import defaultdict
from datetime import date, datetime

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.scoring import inventory_sync
from app.shared.metrics import push_batch_metrics

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)


# ── ヘルパー ─────────────────────────────────────────────────


def _sigmoid(x: float) -> float:
    """シグモイド関数（0〜1）"""
    return 1.0 / (1.0 + math.exp(-x))


def _churn_score(days: int | None) -> float:
    """
    最終購買からの経過日数 → チャーンリスクスコア（0〜1）
    - 30日以内: ≈ 0.1（低リスク）
    - 90日: ≈ 0.5
    - 180日以上: ≈ 0.9（高リスク）
    """
    if days is None:
        return 0.8  # 購買履歴なし → 高リスク
    return round(_sigmoid(0.03 * (days - 90)), 4)


def _timing_score(days_since: int | None, avg_interval: float | None) -> float:
    """
    次回購買タイミングスコア（0〜1）
    - 平均購買間隔に近づくほど高スコア（購買が近い）
    - 1.0 = 今すぐ購買しそう
    """
    if days_since is None or avg_interval is None or avg_interval <= 0:
        return 0.0
    ratio = days_since / avg_interval  # 0〜1+
    return round(min(1.0, max(0.0, ratio)), 4)


def _visit_score(days_since: int | None, avg_interval: float | None) -> float:
    """来店予測スコア（購買タイミングと同ロジック）"""
    return _timing_score(days_since, avg_interval)


# ── データロード ──────────────────────────────────────────────


async def load_id_map(
    session: AsyncSession,
) -> tuple[dict[str, int], dict[str, int], dict[str, int]]:
    """customer_id_map から source_id → unified_id のマッピングを返す。"""
    rows = await session.execute(
        text("SELECT source_system, source_id, unified_id FROM customer_id_map")
    )
    ec_map: dict[str, int] = {}
    pos_map: dict[str, int] = {}
    app_map: dict[str, int] = {}
    for sys, sid, uid in rows:
        if sys == "ec":
            ec_map[str(sid)] = uid
        elif sys == "pos":
            pos_map[str(sid)] = uid
        elif sys == "app":
            app_map[str(sid)] = uid
    log.info(f"ID map: ec={len(ec_map)} pos={len(pos_map)} app={len(app_map)}")
    return ec_map, pos_map, app_map


async def load_product_categories(session: AsyncSession) -> dict[int, int]:
    """unified_products から product_id → category_id マッピングを返す。"""
    rows = await session.execute(
        text(
            "SELECT unified_product_id, category_id"
            " FROM unified_products WHERE category_id IS NOT NULL"
        )
    )
    return {pid: cat for pid, cat in rows}


# ── カテゴリ親和性スコア ──────────────────────────────────────


async def compute_category_affinity(
    session: AsyncSession,
    ec_map: dict[str, int],
    prod_cat: dict[int, int],
) -> dict[int, dict[int, float]]:
    """
    staging_ec_events の ec_order イベントから
    (unified_id, category_id) 別の購買金額を集計し、スコア化する。

    Returns: {unified_id: {category_id: affinity_score}}
    """
    rows = await session.execute(
        text("""
            SELECT
                raw::jsonb->>'ec_user_id' AS ec_user_id,
                item->>'ec_product_id' AS ec_product_id,
                (item->>'unit_price')::float * (item->>'quantity')::float AS spend
            FROM staging_ec_events,
                 jsonb_array_elements(raw::jsonb->'items') AS item
            WHERE event_type = 'ec_order'
              AND raw::jsonb->'items' IS NOT NULL
        """)
    )

    # unified_id × category_id → 合計購買金額
    spend: dict[int, dict[int, float]] = defaultdict(lambda: defaultdict(float))
    for ec_user_id, ec_product_id, s in rows:
        uid = ec_map.get(str(ec_user_id))
        if uid is None:
            continue
        pid = int(ec_product_id) if ec_product_id else None
        cat = prod_cat.get(pid) if pid else None
        if cat is None:
            continue
        spend[uid][cat] += s or 0.0

    # カテゴリ別に最大値を取り、0〜1 に正規化
    cat_max: dict[int, float] = defaultdict(float)
    for uid_spend in spend.values():
        for cat, amount in uid_spend.items():
            if amount > cat_max[cat]:
                cat_max[cat] = amount

    result: dict[int, dict[int, float]] = {}
    for uid, cat_spend in spend.items():
        result[uid] = {}
        for cat, amount in cat_spend.items():
            mx = cat_max[cat]
            result[uid][cat] = round(amount / mx, 4) if mx > 0 else 0.0

    log.info(f"category_affinity: {len(result)} 顧客 / {len(cat_max)} カテゴリ")
    return result


# ── チャーンリスク ────────────────────────────────────────────


async def compute_churn_risk(
    session: AsyncSession,
    ec_map: dict[str, int],
    pos_map: dict[str, int],
) -> dict[int, float]:
    """
    最終購買日から unified_id ごとのチャーンリスクスコアを算出する。
    """
    today = date.today()

    # EC購買（ec_order）の最終日
    ec_rows = await session.execute(
        text("""
            SELECT raw::jsonb->>'ec_user_id' AS uid, MAX(ordered_at) AS last_dt
            FROM staging_ec_events
            WHERE event_type = 'ec_order'
            GROUP BY uid
        """)
    )
    last_purchase: dict[int, date] = {}
    for ec_uid, last_dt in ec_rows:
        unified = ec_map.get(str(ec_uid))
        if unified is None or last_dt is None:
            continue
        d = last_dt.date() if isinstance(last_dt, datetime) else last_dt
        if unified not in last_purchase or d > last_purchase[unified]:
            last_purchase[unified] = d

    # POS購買（pos_transaction）の最終日
    pos_rows = await session.execute(
        text("""
            SELECT raw::jsonb->>'member_id' AS uid, MAX(transacted_at) AS last_dt
            FROM staging_pos_transactions
            WHERE event_type = 'pos_transaction'
            GROUP BY uid
        """)
    )
    for pos_uid, last_dt in pos_rows:
        unified = pos_map.get(str(pos_uid))
        if unified is None or last_dt is None:
            continue
        d = last_dt.date() if isinstance(last_dt, datetime) else last_dt
        if unified not in last_purchase or d > last_purchase[unified]:
            last_purchase[unified] = d

    result = {uid: _churn_score((today - d).days) for uid, d in last_purchase.items()}
    log.info(f"churn_risk: {len(result)} 顧客")
    return result


# ── 購買タイミング ────────────────────────────────────────────


async def compute_purchase_timing(
    session: AsyncSession,
    ec_map: dict[str, int],
    pos_map: dict[str, int],
) -> dict[int, float]:
    """
    購買間隔の平均から「次回購買が近い度」スコアを算出する。
    """
    today = date.today()

    # EC purchaseの日付リスト per unified_id
    purchase_dates: dict[int, list[date]] = defaultdict(list)

    ec_rows = await session.execute(
        text("""
            SELECT raw::jsonb->>'ec_user_id' AS uid, ordered_at
            FROM staging_ec_events
            WHERE event_type = 'ec_order' AND ordered_at IS NOT NULL
            ORDER BY uid, ordered_at
        """)
    )
    for ec_uid, dt in ec_rows:
        unified = ec_map.get(str(ec_uid))
        if unified is None:
            continue
        d = dt.date() if isinstance(dt, datetime) else dt
        purchase_dates[unified].append(d)

    pos_rows = await session.execute(
        text("""
            SELECT raw::jsonb->>'member_id' AS uid, transacted_at
            FROM staging_pos_transactions
            WHERE event_type = 'pos_transaction' AND transacted_at IS NOT NULL
            ORDER BY uid, transacted_at
        """)
    )
    for pos_uid, dt in pos_rows:
        unified = pos_map.get(str(pos_uid))
        if unified is None:
            continue
        d = dt.date() if isinstance(dt, datetime) else dt
        purchase_dates[unified].append(d)

    result: dict[int, float] = {}
    for uid, dates in purchase_dates.items():
        dates_sorted = sorted(set(dates))
        if len(dates_sorted) < 2:
            result[uid] = 0.0
            continue
        intervals = [
            (dates_sorted[i + 1] - dates_sorted[i]).days for i in range(len(dates_sorted) - 1)
        ]
        avg_interval = sum(intervals) / len(intervals)
        days_since = (today - dates_sorted[-1]).days
        result[uid] = _timing_score(days_since, avg_interval)

    log.info(f"purchase_timing: {len(result)} 顧客")
    return result


# ── 来店予測 ──────────────────────────────────────────────────


async def compute_visit_prediction(
    session: AsyncSession,
    pos_map: dict[str, int],
) -> dict[int, float]:
    """
    来店間隔の平均から「次回来店が近い度」スコアを算出する。
    """
    today = date.today()

    visit_dates: dict[int, list[date]] = defaultdict(list)
    rows = await session.execute(
        text("""
            SELECT raw::jsonb->>'member_id' AS uid, visited_at
            FROM staging_pos_transactions
            WHERE event_type = 'pos_store_visit' AND visited_at IS NOT NULL
            ORDER BY uid, visited_at
        """)
    )
    for pos_uid, dt in rows:
        unified = pos_map.get(str(pos_uid))
        if unified is None:
            continue
        d = dt.date() if isinstance(dt, datetime) else dt
        visit_dates[unified].append(d)

    result: dict[int, float] = {}
    for uid, dates in visit_dates.items():
        dates_sorted = sorted(set(dates))
        if len(dates_sorted) < 2:
            result[uid] = 0.0
            continue
        intervals = [
            (dates_sorted[i + 1] - dates_sorted[i]).days for i in range(len(dates_sorted) - 1)
        ]
        avg_interval = sum(intervals) / len(intervals)
        days_since = (today - dates_sorted[-1]).days
        result[uid] = _visit_score(days_since, avg_interval)

    log.info(f"visit_prediction: {len(result)} 顧客")
    return result


# ── UPSERT ────────────────────────────────────────────────────


async def upsert_scores(
    session: AsyncSession,
    affinity: dict[int, dict[int, float]],
    churn: dict[int, float],
    timing: dict[int, float],
    visit: dict[int, float],
    run_date: date,
) -> int:
    """customer_scores へ UPSERT する（unified_id × category_id 単位）。"""
    now = datetime.utcnow()

    # affinity がある顧客 × カテゴリを基準にレコードを作る
    rows = 0
    for uid, cat_scores in affinity.items():
        for cat_id, aff_score in cat_scores.items():
            await session.execute(
                text("""
                    INSERT INTO customer_scores
                        (unified_id, category_id, affinity_score, churn_risk_score,
                         visit_predict_score, timing_score, updated_at, batch_run_date)
                    VALUES
                        (:uid, :cat, :aff, :churn, :visit, :timing, :now, :run_date)
                    ON CONFLICT (unified_id, category_id)
                    DO UPDATE SET
                        affinity_score    = EXCLUDED.affinity_score,
                        churn_risk_score  = EXCLUDED.churn_risk_score,
                        visit_predict_score = EXCLUDED.visit_predict_score,
                        timing_score      = EXCLUDED.timing_score,
                        updated_at        = EXCLUDED.updated_at,
                        batch_run_date    = EXCLUDED.batch_run_date
                """),
                {
                    "uid": uid,
                    "cat": cat_id,
                    "aff": aff_score,
                    "churn": churn.get(uid, 0.8),
                    "visit": visit.get(uid, 0.0),
                    "timing": timing.get(uid, 0.0),
                    "now": now,
                    "run_date": run_date,
                },
            )
            rows += 1

    return rows


# ── Redis キャッシュ ──────────────────────────────────────────


async def cache_scores_to_redis(
    affinity: dict[int, dict[int, float]],
    churn: dict[int, float],
    timing: dict[int, float],
    visit: dict[int, float],
) -> int:
    """上位スコアを Redis にキャッシュする（TTL 24h）。"""
    try:
        import redis.asyncio as aioredis
    except ImportError:
        log.warning("redis パッケージが見つかりません。キャッシュをスキップします。")
        return 0

    client = aioredis.from_url(settings.redis_url, decode_responses=True)
    TTL = 86400  # 24h
    count = 0
    try:
        pipe = client.pipeline()
        for uid, cat_scores in affinity.items():
            for cat_id, aff_score in cat_scores.items():
                key = f"score:{uid}:{cat_id}"
                value = {
                    "affinity": aff_score,
                    "churn_risk": churn.get(uid, 0.8),
                    "timing": timing.get(uid, 0.0),
                    "visit": visit.get(uid, 0.0),
                }
                import json

                pipe.set(key, json.dumps(value), ex=TTL)
                count += 1
        await pipe.execute()
    finally:
        await client.aclose()

    log.info(f"Redis キャッシュ: {count} キー (TTL={TTL}s)")
    return count


# ── ClickHouse 集計同期 ────────────────────────────────────────


def _age_group(age: float | None) -> str:
    """年齢 → 年代グループ文字列"""
    if age is None:
        return "不明"
    a = int(age)
    if a < 25:
        return "20代以下"
    if a < 35:
        return "25-34"
    if a < 45:
        return "35-44"
    if a < 55:
        return "45-54"
    return "55以上"


async def sync_to_clickhouse(session: AsyncSession) -> int:
    """
    customer_scores の集計データを ClickHouse の3テーブルに書き込む。
      - customer_scores_daily  : 顧客別スコア（カテゴリ親和性を Map で格納）
      - category_affinity_summary : カテゴリ×年代別集計
      - churn_summary_weekly   : チャーンリスク分布
    clickhouse_connect（HTTP クライアント）を使用。
    """
    try:
        import clickhouse_connect
    except ImportError:
        log.warning("clickhouse_connect が見つかりません。ClickHouseへの同期をスキップします。")
        return 0

    # ── PostgreSQL から生データ取得 ────────────────────────────

    # 顧客別 × カテゴリ別スコア（customer_scores）
    score_rows = await session.execute(
        text("""
            SELECT
                cs.unified_id,
                cs.batch_run_date,
                cs.category_id,
                cs.affinity_score,
                cs.churn_risk_score,
                cs.timing_score,
                cs.visit_predict_score
            FROM customer_scores cs
            ORDER BY cs.unified_id, cs.category_id
        """)
    )

    # カテゴリ × 年代別集計（unified_customers と JOIN）
    cat_aff_rows = await session.execute(
        text("""
            SELECT
                cs.batch_run_date                                   AS week,
                cs.category_id,
                DATE_PART('year', AGE(uc.birth_date))               AS age,
                AVG(cs.affinity_score)                              AS avg_score,
                COUNT(DISTINCT cs.unified_id)                       AS customer_count
            FROM customer_scores cs
            LEFT JOIN unified_customers uc ON cs.unified_id = uc.unified_id
            GROUP BY cs.batch_run_date, cs.category_id,
                     DATE_PART('year', AGE(uc.birth_date))
        """)
    )

    # チャーンリスク分布（顧客ごとに重複排除してからバケット集計）
    churn_rows = await session.execute(
        text("""
            SELECT
                sub.batch_run_date AS week,
                CASE
                    WHEN sub.churn_risk_score >= 0.7 THEN 'high'
                    WHEN sub.churn_risk_score >= 0.3 THEN 'medium'
                    ELSE 'low'
                END AS label,
                COUNT(*) AS customer_count
            FROM (
                SELECT DISTINCT ON (unified_id, batch_run_date)
                    unified_id, batch_run_date, churn_risk_score
                FROM customer_scores
                ORDER BY unified_id, batch_run_date
            ) sub
            GROUP BY sub.batch_run_date,
                CASE
                    WHEN sub.churn_risk_score >= 0.7 THEN 'high'
                    WHEN sub.churn_risk_score >= 0.3 THEN 'medium'
                    ELSE 'low'
                END
        """)
    )

    all_scores = list(score_rows)
    all_cat_aff = list(cat_aff_rows)
    all_churn = list(churn_rows)

    if not all_scores:
        log.info("customer_scores が空のため ClickHouse 同期をスキップします。")
        return 0

    # ── ClickHouse クライアント接続 ────────────────────────────
    ch = clickhouse_connect.get_client(
        host=settings.clickhouse_host,
        port=int(settings.clickhouse_port),
        database=settings.clickhouse_db,
        username=settings.clickhouse_user,
        password=settings.clickhouse_password,
    )

    total_rows = 0

    # ── 1. customer_scores_daily ──────────────────────────────
    # 顧客×バッチ日付ごとに category_affinity Map を組み立てる
    csd_buf: dict[tuple[int, date], dict] = {}
    for uid, batch_date, cat_id, aff, churn_s, timing_s, visit_s in all_scores:
        key = (uid, batch_date)
        if key not in csd_buf:
            csd_buf[key] = {
                "uid": str(uid),
                "date": batch_date,
                "affinity": {},
                "churn": float(churn_s or 0.0),
                "timing": float(timing_s or 0.0),
                "visit": float(visit_s or 0.0),
            }
        csd_buf[key]["affinity"][str(cat_id)] = float(aff or 0.0)

    if csd_buf:
        csd_data = [
            [v["uid"], v["date"], v["affinity"], v["churn"], v["timing"], v["visit"]]
            for v in csd_buf.values()
        ]
        ch.insert(
            "customer_scores_daily",
            csd_data,
            column_names=[
                "unified_id",
                "score_date",
                "category_affinity",
                "churn_risk",
                "purchase_timing",
                "visit_prediction",
            ],
        )
        log.info(f"ClickHouse customer_scores_daily: {len(csd_data)} 行")
        total_rows += len(csd_data)

    # ── 2. category_affinity_summary ─────────────────────────
    if all_cat_aff:
        cas_data = [
            [row[0], int(row[1]), _age_group(row[2]), "", float(row[3] or 0.0), int(row[4] or 0)]
            for row in all_cat_aff
        ]
        ch.insert(
            "category_affinity_summary",
            cas_data,
            column_names=[
                "week",
                "category_id",
                "age_group",
                "gender",
                "avg_score",
                "customer_count",
            ],
        )
        log.info(f"ClickHouse category_affinity_summary: {len(cas_data)} 行")
        total_rows += len(cas_data)

    # ── 3. churn_summary_weekly ──────────────────────────────
    if all_churn:
        csw_data = [[row[0], str(row[1]), int(row[2] or 0), 0.0] for row in all_churn]
        ch.insert(
            "churn_summary_weekly",
            csw_data,
            column_names=["week", "label", "customer_count", "avg_days_since_purchase"],
        )
        log.info(f"ClickHouse churn_summary_weekly: {len(csw_data)} 行")
        total_rows += len(csw_data)

    ch.close()
    log.info(f"ClickHouse 同期完了: 合計 {total_rows} 行")
    return total_rows


# ── メイン ────────────────────────────────────────────────────


async def main_async(mode: str) -> None:
    engine = create_async_engine(settings.postgres_url, echo=False)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    run_date = date.today()
    now = datetime.utcnow()

    with push_batch_metrics("scoring_batch") as bm:
        async with factory() as session:
            # ── 在庫同期（unified_products が空なら実行） ──
            count_row = await session.execute(text("SELECT COUNT(*) FROM unified_products"))
            prod_count = count_row.scalar()
            if prod_count == 0:
                log.info("unified_products が空のため在庫同期を実行...")
                await inventory_sync.run(session)
            else:
                log.info(f"unified_products: {prod_count} 件（同期スキップ）")

            # ── IDマッピング ──
            ec_map, pos_map, app_map = await load_id_map(session)
            prod_cat = await load_product_categories(session)
            log.info(f"商品カテゴリマップ: {len(prod_cat)} 件")

            # ── スコア計算 ──
            affinity: dict[int, dict[int, float]] = {}
            churn: dict[int, float] = {}
            timing: dict[int, float] = {}
            visit: dict[int, float] = {}

            if mode in ("daily", "full"):
                affinity = await compute_category_affinity(session, ec_map, prod_cat)

            if mode in ("weekly", "full"):
                churn = await compute_churn_risk(session, ec_map, pos_map)
                timing = await compute_purchase_timing(session, ec_map, pos_map)
                visit = await compute_visit_prediction(session, pos_map)

            # daily のみの場合は既存の churn/timing/visit を維持するため 0 で初期化しない
            if mode == "daily" and not churn:
                # 既存スコアを読み込む
                ex_rows = await session.execute(
                    text(
                        "SELECT unified_id, churn_risk_score, timing_score, visit_predict_score"
                        " FROM customer_scores"
                    )
                )
                for uid, cr, ts, vs in ex_rows:
                    churn[uid] = cr
                    timing[uid] = ts
                    visit[uid] = vs

            # ── UPSERT ──
            if not affinity:
                log.info("affinity スコアなし（週次モードでは customer_scores の更新はありません）")
                # weekly モード: churn/timing/visit のみ更新（既存レコードの category は維持）
                if mode == "weekly":
                    rows_updated = 0
                    for uid in churn:
                        res = await session.execute(
                            text("""
                                UPDATE customer_scores SET
                                    churn_risk_score    = :churn,
                                    timing_score        = :timing,
                                    visit_predict_score = :visit,
                                    updated_at          = :now,
                                    batch_run_date      = :run_date
                                WHERE unified_id = :uid
                            """),
                            {
                                "churn": churn[uid],
                                "timing": timing.get(uid, 0.0),
                                "visit": visit.get(uid, 0.0),
                                "now": now,
                                "run_date": run_date,
                                "uid": uid,
                            },
                        )
                        rows_updated += res.rowcount
                    await session.commit()
                    log.info(f"週次スコア更新: {rows_updated} 行")
                    bm.records_processed = rows_updated
            else:
                total = await upsert_scores(session, affinity, churn, timing, visit, run_date)
                await session.commit()
                log.info(f"customer_scores UPSERT: {total} 行")
                bm.records_processed = total

            # ── Redis キャッシュ ──
            if affinity:
                await cache_scores_to_redis(affinity, churn, timing, visit)

            # ── ClickHouse 同期 ──
            await sync_to_clickhouse(session)

    await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description="スコアリングバッチ")
    parser.add_argument(
        "--mode",
        choices=["daily", "weekly", "full"],
        default="full",
        help="daily=親和性のみ / weekly=チャーン・タイミング・来店のみ / full=全スコア",
    )
    args = parser.parse_args()
    log.info(f"スコアリングバッチ開始: mode={args.mode}")
    asyncio.run(main_async(args.mode))
    log.info("スコアリングバッチ完了")


if __name__ == "__main__":
    main()
