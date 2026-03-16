from dataclasses import dataclass
from typing import Protocol


@dataclass
class ColumnInfo:
    name: str
    data_type: str
    nullable: bool
    default: str | None


@dataclass
class TableSchema:
    table_name: str
    columns: list[ColumnInfo]


class ISchemaRepository(Protocol):
    async def list_tables(self, schema: str = "public") -> list[TableSchema]: ...
