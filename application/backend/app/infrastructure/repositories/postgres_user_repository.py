from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.entities.user import UserRecord
from app.domain.value_objects.role import Role
from app.infrastructure.database.models import UserModel


class PostgresUserRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def find_by_username(self, username: str) -> UserRecord | None:
        result = await self._db.execute(
            select(UserModel).where(UserModel.username == username)
        )
        user = result.scalar_one_or_none()
        if user is None:
            return None
        return UserRecord(
            user_id=user.id,
            username=user.username,
            hashed_password=user.hashed_password,
            role=Role(user.role),
            store_id=user.store_id,
        )
