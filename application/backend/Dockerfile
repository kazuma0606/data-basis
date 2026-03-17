# ── Stage 1: 依存インストール ─────────────────────────────────
FROM python:3.12-slim AS builder

# uv をコピー
COPY --from=ghcr.io/astral-sh/uv:0.5 /uv /usr/local/bin/uv

WORKDIR /app

# 依存定義ファイルを先にコピーしてキャッシュを効かせる
COPY pyproject.toml uv.lock ./

# 本番依存のみインストール（dev グループを除外）
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

# ── Stage 2: ランタイム ────────────────────────────────────────
FROM python:3.12-slim AS runtime

# 非rootユーザーで実行
RUN useradd --system --create-home --uid 1000 appuser

WORKDIR /app

# 仮想環境とアプリケーションコードのみコピー
COPY --from=builder --chown=appuser:appuser /app/.venv /app/.venv
COPY --chown=appuser:appuser app/ ./app/

# .venv のパスを通す
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

USER appuser

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
