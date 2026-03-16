from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database.models import PipelineJobModel, ScoringBatchModel
from app.interfaces.repositories.job_repository import PipelineJob, ScoringBatch


class PostgresJobRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def list_pipeline_jobs(self, limit: int = 20) -> list[PipelineJob]:
        result = await self._db.execute(
            select(PipelineJobModel).order_by(desc(PipelineJobModel.started_at)).limit(limit)
        )
        return [
            PipelineJob(
                id=row.id,
                job_name=row.job_name,
                status=row.status,
                started_at=row.started_at,
                finished_at=row.finished_at,
                records_processed=row.records_processed,
                error_message=row.error_message,
            )
            for row in result.scalars()
        ]

    async def list_scoring_batches(self, limit: int = 20) -> list[ScoringBatch]:
        result = await self._db.execute(
            select(ScoringBatchModel).order_by(desc(ScoringBatchModel.started_at)).limit(limit)
        )
        return [
            ScoringBatch(
                id=row.id,
                batch_type=row.batch_type,
                status=row.status,
                started_at=row.started_at,
                finished_at=row.finished_at,
                records_processed=row.records_processed,
                next_run_at=row.next_run_at,
            )
            for row in result.scalars()
        ]
