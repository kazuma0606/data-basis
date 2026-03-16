from app.interfaces.repositories.job_repository import IJobRepository, PipelineJob


class GetPipelineJobsUseCase:
    def __init__(self, job_repo: IJobRepository) -> None:
        self._job_repo = job_repo

    async def execute(self, limit: int = 20) -> list[PipelineJob]:
        return await self._job_repo.list_pipeline_jobs(limit=limit)
