from app.interfaces.clients.kafka_client import IKafkaAdminClient, KafkaConsumerGroup


class GetConsumerGroupsUseCase:
    def __init__(self, kafka: IKafkaAdminClient) -> None:
        self._kafka = kafka

    async def execute(self) -> list[KafkaConsumerGroup]:
        return await self._kafka.list_consumer_groups()
