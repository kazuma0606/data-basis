from unittest.mock import AsyncMock

import bcrypt
import pytest

from app.domain.entities.user import UserRecord
from app.domain.exceptions import UnauthorizedError
from app.domain.value_objects.role import Role
from app.use_cases.auth.login import LoginUseCase


def _hash(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=4)).decode()


@pytest.fixture
def admin_record() -> UserRecord:
    return UserRecord(
        user_id=1,
        username="admin",
        hashed_password=_hash("admin123"),
        role=Role.ADMIN,
    )


@pytest.fixture
def mock_repo(admin_record: UserRecord) -> AsyncMock:
    repo = AsyncMock()
    repo.find_by_username.return_value = admin_record
    return repo


@pytest.mark.asyncio
async def test_login_success(mock_repo: AsyncMock) -> None:
    use_case = LoginUseCase(mock_repo)
    token = await use_case.execute("admin", "admin123")
    assert isinstance(token, str)
    assert len(token) > 0


@pytest.mark.asyncio
async def test_login_wrong_password(mock_repo: AsyncMock) -> None:
    use_case = LoginUseCase(mock_repo)
    with pytest.raises(UnauthorizedError):
        await use_case.execute("admin", "wrongpassword")


@pytest.mark.asyncio
async def test_login_user_not_found() -> None:
    repo = AsyncMock()
    repo.find_by_username.return_value = None
    use_case = LoginUseCase(repo)
    with pytest.raises(UnauthorizedError):
        await use_case.execute("nonexistent", "password")


@pytest.mark.asyncio
async def test_login_calls_repo_with_username(mock_repo: AsyncMock) -> None:
    use_case = LoginUseCase(mock_repo)
    await use_case.execute("admin", "admin123")
    mock_repo.find_by_username.assert_called_once_with("admin")
