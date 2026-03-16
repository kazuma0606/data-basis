from typing import Annotated

from fastapi import APIRouter, Depends

from app.dependencies import get_current_user, get_login_use_case
from app.domain.entities.user import AuthUser
from app.presentation.schemas.auth import LoginRequest, MeResponse, TokenResponse
from app.use_cases.auth.get_me import GetMeUseCase
from app.use_cases.auth.login import LoginUseCase

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    use_case: Annotated[LoginUseCase, Depends(get_login_use_case)],
) -> TokenResponse:
    token = await use_case.execute(body.username, body.password)
    return TokenResponse(access_token=token)


@router.post("/logout")
async def logout(
    _: Annotated[AuthUser, Depends(get_current_user)],
) -> dict[str, str]:
    # JWT はステートレスのためサーバー側での無効化は行わない
    # クライアント側でトークンを破棄する
    return {"message": "ログアウトしました"}


@router.get("/me", response_model=MeResponse)
async def me(
    current_user: Annotated[AuthUser, Depends(get_current_user)],
) -> MeResponse:
    result = GetMeUseCase().execute(current_user)
    return MeResponse(
        user_id=result.user_id,
        username=result.username,
        role=result.role.value,
        store_id=result.store_id,
    )
