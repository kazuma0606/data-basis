import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass


@dataclass
class ServiceHealth:
    name: str
    status: str  # 'ok' | 'error'
    error: str | None = None


@dataclass
class HealthCheckResult:
    overall: str  # 'ok' | 'degraded'
    services: list[ServiceHealth]


class HealthCheckUseCase:
    def __init__(self, checkers: dict[str, Callable[[], Awaitable[None]]]) -> None:
        self._checkers = checkers

    async def execute(self) -> HealthCheckResult:
        async def run(name: str, checker: Callable[[], Awaitable[None]]) -> ServiceHealth:
            try:
                await checker()
                return ServiceHealth(name=name, status="ok")
            except Exception as e:
                return ServiceHealth(name=name, status="error", error=str(e)[:200])

        results = list(await asyncio.gather(*[run(n, c) for n, c in self._checkers.items()]))
        overall = "ok" if all(s.status == "ok" for s in results) else "degraded"
        return HealthCheckResult(overall=overall, services=results)
