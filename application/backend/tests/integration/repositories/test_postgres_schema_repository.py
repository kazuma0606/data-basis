"""
Integration tests — VM上の PostgreSQL が起動している場合のみ実行。

実行方法:
    uv run python -m pytest -m integration tests/integration/
"""

import pytest

from app.infrastructure.database.postgres import async_session_factory
from app.infrastructure.repositories.postgres_schema_repository import PostgresSchemaRepository


@pytest.mark.integration
async def test_list_tables_returns_list() -> None:
    async with async_session_factory() as session:
        repo = PostgresSchemaRepository(session)
        tables = await repo.list_tables()
        assert isinstance(tables, list)


@pytest.mark.integration
async def test_list_tables_contains_expected_tables() -> None:
    async with async_session_factory() as session:
        repo = PostgresSchemaRepository(session)
        tables = await repo.list_tables()
        names = {t.table_name for t in tables}
        # 統合層・スコアリング層のテーブルが存在することを確認
        expected = {"unified_customers", "churn_labels", "customer_scores"}
        assert expected.issubset(names), f"Missing tables: {expected - names}"


@pytest.mark.integration
async def test_each_table_has_columns() -> None:
    async with async_session_factory() as session:
        repo = PostgresSchemaRepository(session)
        tables = await repo.list_tables()
        for table in tables:
            assert len(table.columns) > 0, f"{table.table_name} has no columns"


@pytest.mark.integration
async def test_unified_customers_has_required_columns() -> None:
    async with async_session_factory() as session:
        repo = PostgresSchemaRepository(session)
        tables = await repo.list_tables()
        uc = next((t for t in tables if t.table_name == "unified_customers"), None)
        if uc is None:
            pytest.skip("unified_customers table not found")
        col_names = {c.name for c in uc.columns}
        assert "unified_id" in col_names
        assert "email" in col_names
