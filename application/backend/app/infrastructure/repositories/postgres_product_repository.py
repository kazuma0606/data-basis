from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.interfaces.repositories.product_repository import ProductResult


class PostgresProductRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def find_similar(
        self,
        embedding: list[float],
        limit: int = 10,
    ) -> list[ProductResult]:
        # pgvector の <=> 演算子でコサイン距離による類似検索
        vec_str = "[" + ",".join(str(v) for v in embedding) + "]"
        stmt = text(
            """
            SELECT unified_product_id, name, brand, price, category_id,
                   1 - (embedding <=> CAST(:emb AS vector)) AS similarity
            FROM unified_products
            WHERE embedding IS NOT NULL
            ORDER BY embedding <=> CAST(:emb AS vector)
            LIMIT :lim
            """
        )
        result = await self._db.execute(stmt, {"emb": vec_str, "lim": limit})
        rows = result.mappings().all()
        return [
            ProductResult(
                unified_product_id=r["unified_product_id"],
                name=r["name"],
                brand=r["brand"],
                price=r["price"],
                category_id=r["category_id"],
                similarity=float(r["similarity"]),
            )
            for r in rows
        ]
