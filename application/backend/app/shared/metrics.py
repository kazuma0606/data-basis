"""
Pushgateway へのバッチジョブメトリクス送信ユーティリティ

使い方:
    from app.shared.metrics import push_batch_metrics

    with push_batch_metrics("scoring_batch") as m:
        # バッチ処理...
        m.records_processed = 1234
"""

import os
import time
from collections.abc import Generator
from contextlib import contextmanager
from dataclasses import dataclass, field

from prometheus_client import CollectorRegistry, Gauge, push_to_gateway

PUSHGATEWAY_URL = os.getenv(
    "PUSHGATEWAY_URL",
    "pushgateway.monitoring.svc.cluster.local:9091",
)


@dataclass
class BatchMetrics:
    records_processed: int = 0
    _extra: dict[str, float] = field(default_factory=dict)

    def set(self, key: str, value: float) -> None:
        self._extra[key] = value


@contextmanager
def push_batch_metrics(job_name: str) -> Generator[BatchMetrics, None, None]:
    """
    バッチジョブの実行時間・処理件数・最終成功時刻を Pushgateway に送信する。

    成功時のみ job_last_success_timestamp を更新する（失敗時は更新しない）。
    """
    m = BatchMetrics()
    start = time.monotonic()
    success = False
    try:
        yield m
        success = True
    finally:
        duration = time.monotonic() - start
        _push(job_name, m, duration, success)


def _push(
    job_name: str,
    m: BatchMetrics,
    duration: float,
    success: bool,
) -> None:
    try:
        registry = CollectorRegistry()

        duration_gauge = Gauge(
            "job_duration_seconds",
            "Batch job duration in seconds",
            registry=registry,
        )
        duration_gauge.set(duration)

        records_gauge = Gauge(
            "job_records_processed",
            "Number of records processed by the batch job",
            registry=registry,
        )
        records_gauge.set(m.records_processed)

        if success:
            success_ts = Gauge(
                "job_last_success_timestamp",
                "Unix timestamp of the last successful batch job run",
                registry=registry,
            )
            success_ts.set_to_current_time()

        push_to_gateway(PUSHGATEWAY_URL, job=job_name, registry=registry)
    except Exception:
        # メトリクス送信失敗はバッチ処理に影響させない
        pass
