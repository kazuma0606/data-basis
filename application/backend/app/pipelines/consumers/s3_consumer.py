"""
S3（LocalStack）書き出しコンシューマー

全トピックを購読し、受信したメッセージを
LocalStack S3 の s3://technomart-datalake/raw/{topic}/{date}/ に JSONL 形式で書き出す。

使い方（バックエンドコンテナ内）:
  # 現在キューにある全メッセージを処理して終了（バッチモード）
  python3 -m app.pipelines.consumers.s3_consumer

運用:
  Kubernetes CronJob として定期実行する想定。
  consumer_timeout_ms で一定時間新規メッセージがなければ自動終了する。
"""

from __future__ import annotations

import json
import logging
from collections import defaultdict
from datetime import UTC, datetime

import boto3
from botocore.exceptions import ClientError
from kafka import KafkaConsumer

from app.config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

TOPICS = ["ec.events", "pos.transactions", "app.behaviors", "inventory.updates"]
GROUP_ID = "s3-writer"
CONSUMER_TIMEOUT_MS = 10000  # 10秒間メッセージがなければ終了


def get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url,
        aws_access_key_id=settings.aws_access_key_id,
        aws_secret_access_key=settings.aws_secret_access_key,
        region_name=settings.aws_default_region,
    )


def ensure_bucket(s3, bucket: str) -> None:
    try:
        s3.head_bucket(Bucket=bucket)
    except ClientError:
        s3.create_bucket(Bucket=bucket)
        log.info(f"S3 バケット作成: {bucket}")


def upload_jsonl(s3, bucket: str, key: str, records: list[dict]) -> None:
    body = "\n".join(json.dumps(r, ensure_ascii=False, default=str) for r in records)
    s3.put_object(Bucket=bucket, Key=key, Body=body.encode("utf-8"))
    log.info(f"  S3 アップロード: s3://{bucket}/{key} ({len(records)} 件)")


def main() -> None:
    s3 = get_s3_client()
    ensure_bucket(s3, settings.s3_bucket)

    consumer = KafkaConsumer(
        *TOPICS,
        bootstrap_servers=settings.kafka_bootstrap_servers,
        group_id=GROUP_ID,
        auto_offset_reset="earliest",
        enable_auto_commit=False,
        value_deserializer=lambda v: json.loads(v.decode("utf-8")),
        consumer_timeout_ms=CONSUMER_TIMEOUT_MS,
    )

    # topic → list[record] でバッファリング
    buffer: dict[str, list[dict]] = defaultdict(list)
    total = 0

    log.info(f"コンシューマー開始: {TOPICS}")
    try:
        for msg in consumer:
            buffer[msg.topic].append(msg.value)
            total += 1

    except StopIteration:
        log.info(f"  タイムアウト: {CONSUMER_TIMEOUT_MS}ms 間メッセージなし")

    # まとめて S3 にアップロード
    date_str = datetime.now(UTC).strftime("%Y-%m-%d")
    ts_str = datetime.now(UTC).strftime("%H%M%S")
    for topic, records in buffer.items():
        if records:
            s3_key = f"raw/{topic}/{date_str}/{ts_str}.jsonl"
            upload_jsonl(s3, settings.s3_bucket, s3_key, records)

    consumer.commit()
    consumer.close()
    log.info(f"完了: 合計 {total} メッセージ処理")


if __name__ == "__main__":
    main()
