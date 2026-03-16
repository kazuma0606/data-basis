from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request

from app.domain.entities.user import AuthUser
from app.domain.exceptions import ForbiddenError, UnauthorizedError
from app.infrastructure.database.postgres import get_db
from app.infrastructure.repositories.postgres_user_repository import PostgresUserRepository
from app.interfaces.repositories.user_repository import IUserRepository
from app.use_cases.auth.login import LoginUseCase


# ── リポジトリ ────────────────────────────────────────────
def get_user_repository(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> IUserRepository:
    return PostgresUserRepository(db)


# ── ユースケース ───────────────────────────────────────────
def get_login_use_case(
    repo: Annotated[IUserRepository, Depends(get_user_repository)],
) -> LoginUseCase:
    return LoginUseCase(repo)


# ── 認証・認可 ────────────────────────────────────────────
def get_current_user(request: Request) -> AuthUser:
    user: AuthUser | None = getattr(request.state, "current_user", None)
    if user is None:
        raise UnauthorizedError()
    return user


def require_ops_role(
    current_user: Annotated[AuthUser, Depends(get_current_user)],
) -> AuthUser:
    if not current_user.role.can_access_ops():
        raise ForbiddenError()
    return current_user


def require_business_role(
    current_user: Annotated[AuthUser, Depends(get_current_user)],
) -> AuthUser:
    if not current_user.role.can_access_business():
        raise ForbiddenError()
    return current_user
