from datetime import datetime

import pytest
from unittest.mock import AsyncMock

from app.interfaces.repositories.job_repository import ScoringBatch
from app.use_cases.ops.get_scoring_batches import GetScoringBatchesUseCase

_NOW = datetime(2026, 3, 16, 0, 0, 0)


@pytest.fixture
def mock_repo() -> AsyncMock:
    repo = AsyncMock()
    repo.list_scoring_batches.return_value = [
        ScoringBatch(
            id=1,
            batch_type="churn_risk",
            status="success",
            started_at=_NOW,
            finished_at=_NOW,
            records_processed=5000,
            next_run_at=None,
        ),
    ]
    return repo


@pytest.mark.asyncio
async def test_returns_batches(mock_repo: AsyncMock) -> None:
    use_case = GetScoringBatchesUseCase(mock_repo)
    batches = await use_case.execute()
    assert len(batches) == 1
    assert batches[0].batch_type == "churn_risk"
    assert batches[0].status == "success"
    assert batches[0].records_processed == 5000


@pytest.mark.asyncio
async def test_passes_limit_to_repo(mock_repo: AsyncMock) -> None:
    use_case = GetScoringBatchesUseCase(mock_repo)
    await use_case.execute(limit=5)
    mock_repo.list_scoring_batches.assert_called_once_with(limit=5)


@pytest.mark.asyncio
async def test_empty_batches(mock_repo: AsyncMock) -> None:
    mock_repo.list_scoring_batches.return_value = []
    use_case = GetScoringBatchesUseCase(mock_repo)
    assert await use_case.execute() == []
