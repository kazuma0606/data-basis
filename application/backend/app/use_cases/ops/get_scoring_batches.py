from app.interfaces.repositories.job_repository import IJobRepository, ScoringBatch


class GetScoringBatchesUseCase:
    def __init__(self, job_repo: IJobRepository) -> None:
        self._job_repo = job_repo

    async def execute(self, limit: int = 20) -> list[ScoringBatch]:
        return await self._job_repo.list_scoring_batches(limit=limit)
