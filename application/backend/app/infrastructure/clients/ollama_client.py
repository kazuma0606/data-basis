import httpx

from app.config import settings

_GENERATE_MODEL = "qwen2.5:3b"
_EMBED_MODEL = "nomic-embed-text"


class OllamaClient:
    def __init__(self, base_url: str | None = None) -> None:
        self._base_url = base_url or settings.ollama_base_url

    async def generate(self, prompt: str) -> str:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{self._base_url}/api/generate",
                json={"model": _GENERATE_MODEL, "prompt": prompt, "stream": False},
            )
            resp.raise_for_status()
            return resp.json()["response"]

    async def embed(self, text: str) -> list[float]:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{self._base_url}/api/embeddings",
                json={"model": _EMBED_MODEL, "prompt": text},
            )
            resp.raise_for_status()
            return resp.json()["embedding"]
