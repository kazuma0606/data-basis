"""
Integration tests — VM上の Kafka (127.0.0.1:32092) が起動している場合のみ実行。

実行方法:
    uv run python -m pytest -m integration tests/integration/
"""
import pytest

from app.infrastructure.clients.kafka_admin_client import KafkaAdminClientImpl

BOOTSTRAP = "192.168.56.10:32092"
EXPECTED_TOPICS = {"ec.events", "pos.transactions", "app.behaviors", "inventory.updates", "customer.scores"}


@pytest.mark.integration
@pytest.mark.asyncio
async def test_list_topics_returns_expected_topics() -> None:
    client = KafkaAdminClientImpl(BOOTSTRAP)
    topics = await client.list_topics()
    names = {t.name for t in topics}
    assert EXPECTED_TOPICS.issubset(names)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_topic_has_positive_message_count() -> None:
    client = KafkaAdminClientImpl(BOOTSTRAP)
    topics = await client.list_topics()
    ec = next((t for t in topics if t.name == "ec.events"), None)
    assert ec is not None
    assert ec.message_count > 0


@pytest.mark.integration
@pytest.mark.asyncio
async def test_topic_partition_count() -> None:
    client = KafkaAdminClientImpl(BOOTSTRAP)
    topics = await client.list_topics()
    ec = next(t for t in topics if t.name == "ec.events")
    assert ec.partitions == 3


@pytest.mark.integration
@pytest.mark.asyncio
async def test_list_consumer_groups() -> None:
    client = KafkaAdminClientImpl(BOOTSTRAP)
    groups = await client.list_consumer_groups()
    assert isinstance(groups, list)
