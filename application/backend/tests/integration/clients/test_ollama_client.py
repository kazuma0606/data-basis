"""
Integration tests — VM上の Ollama が起動している場合のみ実行。

実行方法:
    uv run python -m pytest -m integration tests/integration/
"""

import pytest

from app.infrastructure.clients.ollama_client import OllamaClient

OLLAMA_URL = "http://192.168.56.10:31434"


@pytest.mark.integration
async def test_embed_returns_vector() -> None:
    client = OllamaClient(base_url=OLLAMA_URL)
    embedding = await client.embed("テスト商品 家電")
    assert isinstance(embedding, list)
    assert len(embedding) > 0
    assert all(isinstance(v, float) for v in embedding)


@pytest.mark.integration
async def test_generate_returns_string() -> None:
    client = OllamaClient(base_url=OLLAMA_URL)
    response = await client.generate("「こんにちは」と返してください。")
    assert isinstance(response, str)
    assert len(response) > 0
