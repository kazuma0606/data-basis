from datetime import UTC, datetime, timedelta

from jose import JWTError, jwt

from app.config import settings
from app.domain.entities.user import AuthUser
from app.domain.exceptions import UnauthorizedError
from app.domain.value_objects.role import Role


def encode_token(user: AuthUser) -> str:
    payload = {
        "sub": str(user.user_id),
        "username": user.username,
        "role": user.role.value,
        "store_id": user.store_id,
        "exp": datetime.now(UTC) + timedelta(minutes=settings.jwt_expire_minutes),
    }
    return str(jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm))


def decode_token(token: str) -> AuthUser:
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        return AuthUser(
            user_id=int(payload["sub"]),
            username=payload["username"],
            role=Role(payload["role"]),
            store_id=payload.get("store_id"),
        )
    except JWTError as e:
        raise UnauthorizedError(f"トークンが無効です: {e}") from e
