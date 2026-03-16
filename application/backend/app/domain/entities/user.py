from dataclasses import dataclass

from app.domain.value_objects.role import Role


@dataclass(frozen=True)
class AuthUser:
    user_id: int
    username: str
    role: Role
    store_id: int | None = None

    def __post_init__(self) -> None:
        if self.role == Role.STORE_MANAGER and self.store_id is None:
            raise ValueError("store_manager には store_id が必要です")
