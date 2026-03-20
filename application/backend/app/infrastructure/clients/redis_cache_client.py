from typing import cast

from redis.asyncio import Redis

from app.infrastructure.database.redis import get_redis


class RedisCacheClient:
    def __init__(self, redis: Redis | None = None) -> None:
        self._redis = redis or get_redis()

    async def get(self, key: str) -> str | None:
        return cast(str | None, await self._redis.get(key))

    async def set(self, key: str, value: str, ttl_seconds: int = 86400) -> None:
        await self._redis.set(key, value, ex=ttl_seconds)

    async def delete(self, key: str) -> None:
        await self._redis.delete(key)
