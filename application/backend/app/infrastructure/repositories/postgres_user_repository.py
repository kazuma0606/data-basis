from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.entities.user import UserRecord
from app.domain.value_objects.role import Role
from app.infrastructure.database.models import UserModel


def _to_record(user: UserModel) -> UserRecord:
    return UserRecord(
        user_id=user.id,
        username=user.username,
        hashed_password=user.hashed_password,
        role=Role(user.role),
        store_id=user.store_id,
        is_active=user.is_active,
    )


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
        # is_active=False のユーザーはログイン不可
        if not user.is_active:
            return None
        return _to_record(user)

    async def list_all(self) -> list[UserRecord]:
        result = await self._db.execute(select(UserModel).order_by(UserModel.id))
        return [_to_record(u) for u in result.scalars().all()]

    async def find_by_id_or_username(self, username: str) -> UserRecord | None:
        """重複チェック用（is_active に関わらず検索）"""
        result = await self._db.execute(
            select(UserModel).where(UserModel.username == username)
        )
        user = result.scalar_one_or_none()
        return _to_record(user) if user else None

    async def find_by_id(self, user_id: int) -> UserRecord | None:
        result = await self._db.execute(
            select(UserModel).where(UserModel.id == user_id)
        )
        user = result.scalar_one_or_none()
        return _to_record(user) if user else None

    async def create(
        self,
        username: str,
        hashed_password: str,
        role: str,
        store_id: int | None = None,
    ) -> UserRecord:
        user = UserModel(
            username=username,
            hashed_password=hashed_password,
            role=role,
            store_id=store_id,
            is_active=True,
        )
        self._db.add(user)
        await self._db.flush()
        await self._db.refresh(user)
        return _to_record(user)

    async def update(
        self,
        user_id: int,
        role: str | None = None,
        is_active: bool | None = None,
    ) -> UserRecord | None:
        result = await self._db.execute(
            select(UserModel).where(UserModel.id == user_id)
        )
        user = result.scalar_one_or_none()
        if user is None:
            return None
        if role is not None:
            user.role = role
        if is_active is not None:
            user.is_active = is_active
        await self._db.flush()
        await self._db.refresh(user)
        return _to_record(user)
