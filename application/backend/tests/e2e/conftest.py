import bcrypt
import pytest
from fastapi.testclient import TestClient

from app.dependencies import get_user_repository
from app.domain.entities.user import UserRecord
from app.domain.value_objects.role import Role
from app.main import app


def _hash(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=4)).decode()


# モジュールロード時に一度だけ計算（rounds=4 で高速化）
_TEST_USERS: dict[str, UserRecord] = {
    "admin": UserRecord(1, "admin", _hash("admin123"), Role.ADMIN),
    "engineer": UserRecord(2, "engineer", _hash("engineer123"), Role.ENGINEER),
    "marketer": UserRecord(3, "marketer", _hash("marketer123"), Role.MARKETER),
    "store_manager": UserRecord(
        4, "store_manager", _hash("manager123"), Role.STORE_MANAGER, store_id=1
    ),
}


class FakeUserRepository:
    async def find_by_username(self, username: str) -> UserRecord | None:
        return _TEST_USERS.get(username)


@pytest.fixture
def client() -> TestClient:
    app.dependency_overrides[get_user_repository] = lambda: FakeUserRepository()
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
