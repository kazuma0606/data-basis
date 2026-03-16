import bcrypt

from app.domain.exceptions import UnauthorizedError
from app.interfaces.repositories.user_repository import IUserRepository
from app.shared.jwt import encode_token


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


class LoginUseCase:
    def __init__(self, user_repo: IUserRepository) -> None:
        self._user_repo = user_repo

    async def execute(self, username: str, password: str) -> str:
        record = await self._user_repo.find_by_username(username)
        if record is None or not verify_password(password, record.hashed_password):
            raise UnauthorizedError("ユーザー名またはパスワードが正しくありません")
        return encode_token(record.to_auth_user())
