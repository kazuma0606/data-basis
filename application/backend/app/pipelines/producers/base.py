"""
Kafka プロデューサー共通設定

使い方:
  from app.pipelines.producers.base import make_producer, send

  producer = make_producer()
  send(producer, "ec.events", {"event_type": "order", ...})
  producer.flush()
  producer.close()
"""

import json
import logging
from datetime import UTC, datetime

from kafka import KafkaProducer

from app.config import settings

log = logging.getLogger(__name__)


def make_producer() -> KafkaProducer:
    return KafkaProducer(
        bootstrap_servers=settings.kafka_bootstrap_servers,
        value_serializer=lambda v: json.dumps(v, ensure_ascii=False, default=str).encode("utf-8"),
        acks="all",
        retries=3,
        request_timeout_ms=10000,
    )


def send(producer: KafkaProducer, topic: str, payload: dict) -> None:
    """メッセージをラップして送信する。"""
    message = {
        "sent_at": datetime.now(UTC).isoformat(),
        **payload,
    }
    producer.send(topic, value=message)
