from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.interfaces.repositories.schema_repository import ColumnInfo, TableSchema


class PostgresSchemaRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def list_tables(self, schema: str = "public") -> list[TableSchema]:
        result = await self._db.execute(
            text("""
                SELECT
                    table_name,
                    column_name,
                    data_type,
                    is_nullable,
                    column_default
                FROM information_schema.columns
                WHERE table_schema = :schema
                ORDER BY table_name, ordinal_position
            """),
            {"schema": schema},
        )

        tables: dict[str, list[ColumnInfo]] = {}
        for row in result.mappings():
            tname = row["table_name"]
            if tname not in tables:
                tables[tname] = []
            tables[tname].append(
                ColumnInfo(
                    name=row["column_name"],
                    data_type=row["data_type"],
                    nullable=row["is_nullable"] == "YES",
                    default=row["column_default"],
                )
            )

        return [TableSchema(table_name=t, columns=cols) for t, cols in tables.items()]
