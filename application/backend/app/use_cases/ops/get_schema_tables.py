from app.interfaces.repositories.schema_repository import ISchemaRepository, TableSchema


class GetSchemaTablesUseCase:
    def __init__(self, schema_repo: ISchemaRepository) -> None:
        self._schema_repo = schema_repo

    async def execute(self) -> list[TableSchema]:
        return await self._schema_repo.list_tables()
