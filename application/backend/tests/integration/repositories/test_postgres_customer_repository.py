"""
Integration tests — VM上の PostgreSQL が起動している場合のみ実行。

実行方法:
    uv run python -m pytest -m integration tests/integration/
"""
import pytest

from app.infrastructure.database.postgres import async_session_factory
from app.infrastructure.repositories.postgres_customer_repository import PostgresCustomerRepository


@pytest.mark.integration
async def test_find_all_returns_list() -> None:
    async with async_session_factory() as session:
        repo = PostgresCustomerRepository(session)
        customers = await repo.find_all(limit=5)
        assert isinstance(customers, list)


@pytest.mark.integration
async def test_count_returns_non_negative() -> None:
    async with async_session_factory() as session:
        repo = PostgresCustomerRepository(session)
        count = await repo.count()
        assert count >= 0


@pytest.mark.integration
async def test_find_by_id_returns_none_for_missing() -> None:
    async with async_session_factory() as session:
        repo = PostgresCustomerRepository(session)
        result = await repo.find_by_id(999999999)
        assert result is None


@pytest.mark.integration
async def test_find_by_id_with_existing_record() -> None:
    async with async_session_factory() as session:
        repo = PostgresCustomerRepository(session)
        customers = await repo.find_all(limit=1)
        if not customers:
            pytest.skip("No customers in DB")
        uid = customers[0].unified_id
        customer = await repo.find_by_id(uid)
        assert customer is not None
        assert customer.unified_id == uid
