import pytest
from unittest.mock import AsyncMock

from app.interfaces.clients.kafka_client import KafkaTopic
from app.use_cases.ops.get_kafka_topics import GetKafkaTopicsUseCase


@pytest.fixture
def mock_kafka() -> AsyncMock:
    kafka = AsyncMock()
    kafka.list_topics.return_value = [
        KafkaTopic(name="ec.events", partitions=3, message_count=43707),
        KafkaTopic(name="pos.transactions", partitions=3, message_count=9385),
    ]
    return kafka


@pytest.mark.asyncio
async def test_returns_topics(mock_kafka: AsyncMock) -> None:
    use_case = GetKafkaTopicsUseCase(mock_kafka)
    topics = await use_case.execute()
    assert len(topics) == 2
    assert topics[0].name == "ec.events"
    assert topics[0].partitions == 3
    assert topics[0].message_count == 43707


@pytest.mark.asyncio
async def test_empty_topics(mock_kafka: AsyncMock) -> None:
    mock_kafka.list_topics.return_value = []
    use_case = GetKafkaTopicsUseCase(mock_kafka)
    topics = await use_case.execute()
    assert topics == []


@pytest.mark.asyncio
async def test_delegates_to_kafka_client(mock_kafka: AsyncMock) -> None:
    use_case = GetKafkaTopicsUseCase(mock_kafka)
    await use_case.execute()
    mock_kafka.list_topics.assert_called_once()
