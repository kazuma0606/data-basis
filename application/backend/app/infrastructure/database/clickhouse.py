import asyncio
from typing import Any

import clickhouse_connect
from clickhouse_connect.driver.client import Client

from app.config import settings

_client: Client | None = None


def _get_client() -> Client:
    global _client
    if _client is None:
        _client = clickhouse_connect.get_client(
            host=settings.clickhouse_host,
            port=settings.clickhouse_port,
            database=settings.clickhouse_db,
            username=settings.clickhouse_user,
            password=settings.clickhouse_password,
        )
    return _client


async def ch_query(query: str, parameters: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    """ClickHouse へのクエリを asyncio.to_thread でラップして非同期実行する"""

    def _execute() -> list[dict[str, Any]]:
        client = _get_client()
        result = client.query(query, parameters=parameters)
        return list(result.named_results())

    return await asyncio.to_thread(_execute)
