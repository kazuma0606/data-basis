import asyncio

from kafka import KafkaConsumer, TopicPartition
from kafka.admin import KafkaAdminClient as _KafkaAdminClient

from app.interfaces.clients.kafka_client import KafkaConsumerGroup, KafkaTopic


class KafkaAdminClientImpl:
    def __init__(self, bootstrap_servers: str) -> None:
        self._bootstrap_servers = bootstrap_servers

    # ── トピック一覧 ──────────────────────────────────────
    def _sync_list_topics(self) -> list[KafkaTopic]:
        consumer = KafkaConsumer(
            bootstrap_servers=self._bootstrap_servers,
            consumer_timeout_ms=5000,
            request_timeout_ms=5000,
        )
        try:
            topic_names = sorted(
                t for t in consumer.topics() if not t.startswith("__")
            )
            result: list[KafkaTopic] = []
            for name in topic_names:
                partitions = consumer.partitions_for_topic(name) or set()
                tps = [TopicPartition(name, p) for p in partitions]
                count = 0
                if tps:
                    try:
                        end = consumer.end_offsets(tps)
                        beg = consumer.beginning_offsets(tps)
                        count = sum(end.get(tp, 0) - beg.get(tp, 0) for tp in tps)
                    except Exception:
                        pass
                result.append(KafkaTopic(name=name, partitions=len(partitions), message_count=count))
            return result
        finally:
            consumer.close()

    async def list_topics(self) -> list[KafkaTopic]:
        return await asyncio.to_thread(self._sync_list_topics)

    # ── コンシューマグループ一覧 ───────────────────────────
    def _sync_list_consumer_groups(self) -> list[KafkaConsumerGroup]:
        admin = _KafkaAdminClient(bootstrap_servers=self._bootstrap_servers)
        try:
            groups = admin.list_consumer_groups()
            result: list[KafkaConsumerGroup] = []
            for g in groups:
                group_id = g.group_id if hasattr(g, "group_id") else str(g[0])
                result.append(KafkaConsumerGroup(group_id=group_id, state="unknown"))
            return result
        finally:
            admin.close()

    async def list_consumer_groups(self) -> list[KafkaConsumerGroup]:
        return await asyncio.to_thread(self._sync_list_consumer_groups)

    async def close(self) -> None:
        pass  # 呼び出しごとに接続を作成・破棄するため不要
