from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class MeResponse(BaseModel):
    user_id: int
    username: str
    role: str
    store_id: int | None


class UserInfo(BaseModel):
    id: int
    username: str
    role: str
    store_id: int | None
    is_active: bool


class CreateUserRequest(BaseModel):
    username: str
    password: str
    role: str
    store_id: int | None = None


class PatchUserRequest(BaseModel):
    role: str | None = None
    is_active: bool | None = None
