"""
アプリ行動ログプロデューサー

verification/technomart.db の app_events を読み込み、
Kafka トピック `app.behaviors` に送信する。

使い方（バックエンドコンテナ内）:
  python3 -m app.pipelines.producers.app_producer --sqlite-path /tmp/technomart.db
"""

from __future__ import annotations

import argparse
import logging
import sqlite3
from pathlib import Path

from app.pipelines.producers.base import make_producer, send

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

TOPIC = "app.behaviors"
try:
    DEFAULT_SQLITE = Path(__file__).parents[6] / "verification" / "technomart.db"
except IndexError:
    DEFAULT_SQLITE = Path("/tmp/technomart.db")


def main(sqlite_path: Path) -> None:
    if not sqlite_path.exists():
        raise FileNotFoundError(f"SQLite DB が見つかりません: {sqlite_path}")

    log.info(f"SQLite: {sqlite_path}")
    conn = sqlite3.connect(sqlite_path)
    producer = make_producer()

    rows = conn.execute(
        "SELECT event_id, uid, event_type, event_value, timestamp FROM app_events"
    ).fetchall()

    log.info(f"[{TOPIC}] アプリイベント送信中... ({len(rows)} 件)")
    for row in rows:
        eid, uid, event_type, event_value, ts = row
        send(producer, TOPIC, {
            "event_type": f"app_{event_type}",
            "event_id": eid,
            "uid": uid,
            "event_value": event_value,
            "timestamp": ts,
        })

    producer.flush()
    producer.close()
    conn.close()
    log.info(f"完了: {len(rows)} メッセージ送信")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--sqlite-path", default=str(DEFAULT_SQLITE))
    args = parser.parse_args()
    main(Path(args.sqlite_path))
