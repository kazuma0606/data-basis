import pytest

from app.use_cases.ops.health_check import HealthCheckResult, HealthCheckUseCase


async def _ok() -> None:
    pass


async def _fail() -> None:
    raise RuntimeError("接続失敗")


@pytest.mark.asyncio
async def test_all_services_ok() -> None:
    use_case = HealthCheckUseCase({"postgresql": _ok, "kafka": _ok, "redis": _ok})
    result = await use_case.execute()
    assert result.overall == "ok"
    assert all(s.status == "ok" for s in result.services)


@pytest.mark.asyncio
async def test_one_service_fails() -> None:
    use_case = HealthCheckUseCase({"postgresql": _ok, "kafka": _fail, "redis": _ok})
    result = await use_case.execute()
    assert result.overall == "degraded"
    kafka = next(s for s in result.services if s.name == "kafka")
    assert kafka.status == "error"
    assert kafka.error is not None


@pytest.mark.asyncio
async def test_error_message_is_truncated() -> None:
    async def _long_error() -> None:
        raise RuntimeError("x" * 500)

    use_case = HealthCheckUseCase({"svc": _long_error})
    result = await use_case.execute()
    svc = result.services[0]
    assert svc.status == "error"
    assert len(svc.error or "") <= 200


@pytest.mark.asyncio
async def test_returns_health_check_result_type() -> None:
    use_case = HealthCheckUseCase({"svc": _ok})
    result = await use_case.execute()
    assert isinstance(result, HealthCheckResult)
    assert len(result.services) == 1
