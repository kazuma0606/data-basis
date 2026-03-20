from collections.abc import Awaitable, Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.domain.exceptions import UnauthorizedError
from app.shared.jwt import decode_token


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        request.state.current_user = None

        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header.removeprefix("Bearer ")
            try:
                request.state.current_user = decode_token(token)
            except UnauthorizedError:
                pass  # current_user は None のまま。依存関数側で 401 を返す

        response: Response = await call_next(request)
        return response
