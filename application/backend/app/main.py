from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.domain.exceptions import ForbiddenError, NotFoundError, UnauthorizedError
from app.presentation.middleware.auth_middleware import AuthMiddleware
from app.presentation.middleware.logging_middleware import LoggingMiddleware
from app.presentation.routers import auth as auth_router
from app.presentation.routers import business as business_router
from app.presentation.routers import ops as ops_router
from app.presentation.routers import users as users_router
from app.shared.logging import configure_logging, get_logger

configure_logging()
logger = get_logger(__name__)

app = FastAPI(
    title="Technomart Data Platform API",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(LoggingMiddleware)
app.add_middleware(AuthMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://192.168.56.10:30080"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── グローバル例外ハンドラ ────────────────────────────────
@app.exception_handler(NotFoundError)
async def not_found_handler(_: Request, exc: NotFoundError) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": str(exc)})


@app.exception_handler(UnauthorizedError)
async def unauthorized_handler(_: Request, exc: UnauthorizedError) -> JSONResponse:
    return JSONResponse(status_code=401, content={"detail": str(exc)})


@app.exception_handler(ForbiddenError)
async def forbidden_handler(_: Request, exc: ForbiddenError) -> JSONResponse:
    return JSONResponse(status_code=403, content={"detail": str(exc)})


# ── ルーター登録 ──────────────────────────────────────────
app.include_router(auth_router.router)
app.include_router(users_router.router)
app.include_router(ops_router.router)
app.include_router(business_router.router)


# ── ヘルスチェック ────────────────────────────────────────
@app.get("/healthz", tags=["system"])
async def healthz() -> dict[str, str]:
    return {"status": "ok"}
