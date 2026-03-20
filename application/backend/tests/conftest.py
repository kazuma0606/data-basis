import os

# テスト実行前に必要な環境変数を設定する
# .env が存在しない環境でも動作するように setdefault を使用
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-testing-only-do-not-use-in-production")
os.environ.setdefault("POSTGRES_PASSWORD", "technomart")
os.environ.setdefault("CLICKHOUSE_PASSWORD", "technomart")

import pytest
from fastapi.testclient import TestClient

from app.main import app

# ── 共通フィクスチャ ──────────────────────────────────────────


@pytest.fixture(scope="session")
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
def base_client() -> TestClient:
    """依存関係を差し替えない素のTestClient。unit/E2Eで個別にoverridesを行う場合に使う。"""
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ── テスト用キャッシュクライアント ────────────────────────────


class InMemoryCacheClient:
    """Redisの代わりに使うインメモリキャッシュ（テスト専用）"""

    def __init__(self) -> None:
        self._store: dict[str, str] = {}

    async def get(self, key: str) -> str | None:
        return self._store.get(key)

    async def set(self, key: str, value: str, ttl_seconds: int = 86400) -> None:
        self._store[key] = value

    async def delete(self, key: str) -> None:
        self._store.pop(key, None)


@pytest.fixture
def in_memory_cache() -> InMemoryCacheClient:
    return InMemoryCacheClient()
