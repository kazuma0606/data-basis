from redis.asyncio import Redis
from redis.asyncio import from_url as redis_from_url

from app.config import settings

_redis_client: Redis | None = None


def get_redis() -> Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = redis_from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
        )
    return _redis_client
