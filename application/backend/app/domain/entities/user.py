from dataclasses import dataclass

from app.domain.value_objects.role import Role


@dataclass(frozen=True)
class UserRecord:
    """リポジトリから返されるユーザーレコード（ハッシュ化パスワード含む）"""

    user_id: int
    username: str
    hashed_password: str
    role: Role
    store_id: int | None = None

    def to_auth_user(self) -> "AuthUser":
        return AuthUser(
            user_id=self.user_id,
            username=self.username,
            role=self.role,
            store_id=self.store_id,
        )


@dataclass(frozen=True)
class AuthUser:
    user_id: int
    username: str
    role: Role
    store_id: int | None = None

    def __post_init__(self) -> None:
        if self.role == Role.STORE_MANAGER and self.store_id is None:
            raise ValueError("store_manager には store_id が必要です")
