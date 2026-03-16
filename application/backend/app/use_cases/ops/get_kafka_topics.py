from app.interfaces.clients.kafka_client import IKafkaAdminClient, KafkaTopic


class GetKafkaTopicsUseCase:
    def __init__(self, kafka: IKafkaAdminClient) -> None:
        self._kafka = kafka

    async def execute(self) -> list[KafkaTopic]:
        return await self._kafka.list_topics()
