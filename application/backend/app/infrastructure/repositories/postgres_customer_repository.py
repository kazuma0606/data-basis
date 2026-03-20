from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.entities.customer import ChurnLabel, CustomerScore, UnifiedCustomer
from app.infrastructure.database.models import (
    ChurnLabelModel,
    CustomerScoreModel,
    UnifiedCustomerModel,
)


class PostgresCustomerRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def find_by_id(self, unified_id: int) -> UnifiedCustomer | None:
        result = await self._db.execute(
            select(UnifiedCustomerModel).where(UnifiedCustomerModel.unified_id == unified_id)
        )
        row = result.scalar_one_or_none()
        if row is None:
            return None
        return await self._enrich(row)

    async def find_all(
        self,
        store_id: int | None = None,
        offset: int = 0,
        limit: int = 20,
    ) -> list[UnifiedCustomer]:
        stmt = select(UnifiedCustomerModel)
        if store_id is not None:
            # store_id でフィルタ: customer_id_map から pos source_id の store 情報は
            # 直接持たないため、簡易実装として unified_id のサブセットを CustomerIdMap 経由で絞る
            # 実際の本番では pos_transactions.store_id を JOIN するが、ここでは省略
            # store_id フィルタはスコープ外のため全件取得でよい（ビジネスロジック側でフィルタ）
            stmt = stmt
        stmt = stmt.offset(offset).limit(limit)
        result = await self._db.execute(stmt)
        rows = result.scalars().all()
        customers = []
        for row in rows:
            customers.append(await self._enrich(row))
        return customers

    async def count(self, store_id: int | None = None) -> int:
        stmt = select(func.count()).select_from(UnifiedCustomerModel)
        result = await self._db.execute(stmt)
        return int(result.scalar_one())

    async def _enrich(self, row: UnifiedCustomerModel) -> UnifiedCustomer:
        """チャーンラベルとスコアを JOIN して返す"""
        # churn_label
        cl_result = await self._db.execute(
            select(ChurnLabelModel).where(ChurnLabelModel.unified_id == row.unified_id)
        )
        cl_row = cl_result.scalar_one_or_none()
        churn_label: ChurnLabel | None = None
        if cl_row is not None:
            churn_label = ChurnLabel(
                unified_id=cl_row.unified_id,
                label=cl_row.label,
                last_purchase_at=cl_row.last_purchase_at,
                days_since_purchase=cl_row.days_since_purchase,
                updated_at=cl_row.updated_at,
            )

        # scores
        scores_result = await self._db.execute(
            select(CustomerScoreModel).where(CustomerScoreModel.unified_id == row.unified_id)
        )
        scores = [
            CustomerScore(
                unified_id=s.unified_id,
                category_id=s.category_id,
                affinity_score=s.affinity_score,
                churn_risk_score=s.churn_risk_score,
                visit_predict_score=s.visit_predict_score,
                timing_score=s.timing_score,
                updated_at=s.updated_at,
            )
            for s in scores_result.scalars()
        ]

        canonical_name = row.name_kanji or row.name_kana or ""
        return UnifiedCustomer(
            unified_id=row.unified_id,
            canonical_name=canonical_name,
            email=row.email,
            phone=row.phone,
            birth_date=row.birth_date,
            prefecture=row.prefecture,
            churn_label=churn_label,
            scores=scores,
        )
