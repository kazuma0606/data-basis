from app.use_cases.business.natural_language_query import NaturalLanguageQueryUseCase


class FakeLLMClient:
    async def generate(self, prompt: str) -> str:
        return f"回答: {prompt[-10:]}"

    async def embed(self, text: str) -> list[float]:
        return [0.0] * 768


async def test_answer_contains_llm_response() -> None:
    use_case = NaturalLanguageQueryUseCase(FakeLLMClient())
    result = await use_case.execute("アクティブ顧客は何人いますか？")
    assert isinstance(result, str)
    assert len(result) > 0


async def test_prompt_includes_query() -> None:
    captured: list[str] = []

    class CapturingLLM:
        async def generate(self, prompt: str) -> str:
            captured.append(prompt)
            return "dummy"

        async def embed(self, text: str) -> list[float]:
            return []

    use_case = NaturalLanguageQueryUseCase(CapturingLLM())
    await use_case.execute("チャーン率を教えてください")
    assert len(captured) == 1
    assert "チャーン率を教えてください" in captured[0]
    assert "スキーマ" in captured[0]
