from dataclasses import dataclass
from typing import Protocol


@dataclass
class KafkaTopic:
    name: str
    partitions: int
    message_count: int


@dataclass
class KafkaConsumerGroup:
    group_id: str
    state: str


class IKafkaAdminClient(Protocol):
    async def list_topics(self) -> list[KafkaTopic]: ...
    async def list_consumer_groups(self) -> list[KafkaConsumerGroup]: ...
    async def close(self) -> None: ...
