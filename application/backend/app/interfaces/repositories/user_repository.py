from typing import Protocol

from app.domain.entities.user import UserRecord


class IUserRepository(Protocol):
    async def find_by_username(self, username: str) -> UserRecord | None: ...
