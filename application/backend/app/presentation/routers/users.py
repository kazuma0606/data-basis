"""
ユーザー管理 API（admin 専用）

GET    /auth/users          → ユーザー一覧
POST   /auth/users          → ユーザー作成
PATCH  /auth/users/{id}     → ロール変更・有効/無効切替
"""

from typing import Annotated

import bcrypt
from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import get_current_user, get_user_repository
from app.domain.entities.user import AuthUser
from app.domain.exceptions import ForbiddenError
from app.domain.value_objects.role import Role
from app.infrastructure.repositories.postgres_user_repository import PostgresUserRepository
from app.interfaces.repositories.user_repository import IUserRepository
from app.presentation.schemas.auth import CreateUserRequest, PatchUserRequest, UserInfo

router = APIRouter(prefix="/auth/users", tags=["users"])

VALID_ROLES = {r.value for r in Role}


def require_admin(
    current_user: Annotated[AuthUser, Depends(get_current_user)],
) -> AuthUser:
    if current_user.role != Role.ADMIN:
        raise ForbiddenError("admin 権限が必要です")
    return current_user


def _hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt(12)).decode()


@router.get("", response_model=list[UserInfo])
async def list_users(
    _: Annotated[AuthUser, Depends(require_admin)],
    repo: Annotated[IUserRepository, Depends(get_user_repository)],
) -> list[UserInfo]:
    pg_repo = repo  # PostgresUserRepository
    assert isinstance(pg_repo, PostgresUserRepository)
    records = await pg_repo.list_all()
    return [
        UserInfo(
            id=r.user_id,
            username=r.username,
            role=r.role.value,
            store_id=r.store_id,
            is_active=r.is_active,
        )
        for r in records
    ]


@router.post("", response_model=UserInfo, status_code=201)
async def create_user(
    body: CreateUserRequest,
    _: Annotated[AuthUser, Depends(require_admin)],
    repo: Annotated[IUserRepository, Depends(get_user_repository)],
) -> UserInfo:
    if body.role not in VALID_ROLES:
        raise HTTPException(status_code=422, detail=f"無効なロール: {body.role}")
    if body.role == Role.STORE_MANAGER.value and body.store_id is None:
        raise HTTPException(status_code=422, detail="store_manager には store_id が必要です")

    pg_repo = repo
    assert isinstance(pg_repo, PostgresUserRepository)

    # 重複チェック（find_by_username は is_active=False を除外するため直接検索）
    existing = await pg_repo.find_by_id_or_username(body.username)
    if existing:
        raise HTTPException(status_code=409, detail="そのユーザー名は既に使用されています")

    hashed = _hash_password(body.password)
    record = await pg_repo.create(body.username, hashed, body.role, body.store_id)
    await pg_repo._db.commit()

    return UserInfo(
        id=record.user_id,
        username=record.username,
        role=record.role.value,
        store_id=record.store_id,
        is_active=record.is_active,
    )


@router.patch("/{user_id}", response_model=UserInfo)
async def patch_user(
    user_id: int,
    body: PatchUserRequest,
    current_user: Annotated[AuthUser, Depends(require_admin)],
    repo: Annotated[IUserRepository, Depends(get_user_repository)],
) -> UserInfo:
    if body.role is not None and body.role not in VALID_ROLES:
        raise HTTPException(status_code=422, detail=f"無効なロール: {body.role}")

    # 自分自身の無効化・ロール変更は禁止
    if user_id == current_user.user_id:
        raise HTTPException(status_code=400, detail="自分自身のアカウントは変更できません")

    pg_repo = repo
    assert isinstance(pg_repo, PostgresUserRepository)
    record = await pg_repo.update(user_id, role=body.role, is_active=body.is_active)
    if record is None:
        raise HTTPException(status_code=404, detail="ユーザーが見つかりません")

    await pg_repo._db.commit()

    return UserInfo(
        id=record.user_id,
        username=record.username,
        role=record.role.value,
        store_id=record.store_id,
        is_active=record.is_active,
    )
