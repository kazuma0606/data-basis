from dataclasses import dataclass
from datetime import datetime
from typing import Protocol


@dataclass
class PipelineJob:
    id: int
    job_name: str
    status: str
    started_at: datetime
    finished_at: datetime | None
    records_processed: int | None
    error_message: str | None


@dataclass
class ScoringBatch:
    id: int
    batch_type: str
    status: str
    started_at: datetime
    finished_at: datetime | None
    records_processed: int | None
    next_run_at: datetime | None


class IJobRepository(Protocol):
    async def list_pipeline_jobs(self, limit: int = 20) -> list[PipelineJob]: ...
    async def list_scoring_batches(self, limit: int = 20) -> list[ScoringBatch]: ...
