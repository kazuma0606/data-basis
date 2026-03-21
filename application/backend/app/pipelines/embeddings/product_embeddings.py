"""
商品 Embedding 生成バッチ

unified_products テーブルの全商品に対して nomic-embed-text (768次元) で
Embedding を生成し、unified_products.embedding カラムに格納する。

使い方（バックエンドコンテナ内）:
  python3 -m app.pipelines.embeddings.product_embeddings

処理:
  1. unified_products.embedding カラムが存在しなければ追加（べき等）
  2. embedding が NULL の商品だけを対象（既存 embedding を保持）
  3. Ollama nomic-embed-text API でバッチ処理（1件ずつ）
  4. UPDATE unified_products SET embedding = ... WHERE unified_product_id = ...
"""

from __future__ import annotations

import asyncio
import logging

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.shared.metrics import push_batch_metrics

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

EMBED_MODEL = "nomic-embed-text"
OLLAMA_TIMEOUT = 60.0


async def ensure_embedding_column(session: AsyncSession) -> None:
    """unified_products に embedding vector(768) カラムを追加する（べき等）"""
    result = await session.execute(
        text("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'unified_products'
              AND column_name = 'embedding'
              AND table_schema = 'public'
        """)
    )
    if result.fetchone() is None:
        await session.execute(text("ALTER TABLE unified_products ADD COLUMN embedding vector(768)"))
        await session.commit()
        log.info("unified_products.embedding カラムを追加しました")
    else:
        log.info("unified_products.embedding カラムは既存")


async def fetch_embed(client: httpx.AsyncClient, text_input: str) -> list[float]:
    """Ollama API でテキストの Embedding を取得する"""
    resp = await client.post(
        f"{settings.ollama_base_url}/api/embeddings",
        json={"model": EMBED_MODEL, "prompt": text_input},
        timeout=OLLAMA_TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()["embedding"]


async def run_batch(session: AsyncSession) -> int:
    """embedding が NULL の商品を取得してバッチ処理"""
    rows = await session.execute(
        text("""
            SELECT unified_product_id, name, brand, category_id
            FROM unified_products
            WHERE embedding IS NULL
            ORDER BY unified_product_id
        """)
    )
    products = rows.fetchall()
    if not products:
        log.info("embedding 未生成の商品はありません")
        return 0

    log.info(f"{len(products)} 件の商品 Embedding を生成します...")

    count = 0
    async with httpx.AsyncClient() as http_client:
        for pid, name, brand, category_id in products:
            # テキスト表現: 商品名 + ブランド + カテゴリID
            parts = [name]
            if brand:
                parts.append(brand)
            if category_id:
                parts.append(f"category:{category_id}")
            input_text = " ".join(parts)

            try:
                embedding = await fetch_embed(http_client, input_text)
            except Exception as e:
                log.warning(f"  product_id={pid} Embedding 失敗: {e}")
                continue

            vec_str = "[" + ",".join(f"{v:.6f}" for v in embedding) + "]"
            await session.execute(
                text("""
                    UPDATE unified_products
                    SET embedding = CAST(:emb AS vector)
                    WHERE unified_product_id = :pid
                """),
                {"emb": vec_str, "pid": pid},
            )
            count += 1
            if count % 5 == 0:
                await session.commit()
                log.info(f"  {count}/{len(products)} 件完了")

    await session.commit()
    log.info(f"商品 Embedding 生成完了: {count}/{len(products)} 件")
    return count


async def main_async() -> None:
    engine = create_async_engine(settings.postgres_url, echo=False)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    with push_batch_metrics("product_embeddings") as bm:
        async with factory() as session:
            await ensure_embedding_column(session)
            count = await run_batch(session)
        bm.records_processed = count

    await engine.dispose()
    log.info(f"完了: {count} 件の Embedding を格納")


def main() -> None:
    log.info("商品 Embedding 生成バッチ開始")
    asyncio.run(main_async())
    log.info("商品 Embedding 生成バッチ終了")


if __name__ == "__main__":
    main()
