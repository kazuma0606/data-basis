"""
接続設定 - VM内から NodePort 経由でサービスに接続
（127.0.0.1 = VM自身のノード）
"""
import os

POSTGRESQL = {
    "host":     os.getenv("PG_HOST",   "127.0.0.1"),
    "port":     int(os.getenv("PG_PORT", "32432")),
    "dbname":   os.getenv("PG_DB",     "technomart"),
    "user":     os.getenv("PG_USER",   "technomart"),
    "password": os.getenv("PG_PASS",   "technomart"),
}

CLICKHOUSE = {
    "host":     os.getenv("CH_HOST",   "127.0.0.1"),
    "port":     int(os.getenv("CH_PORT", "30823")),
    "database": os.getenv("CH_DB",     "technomart"),
    "username": os.getenv("CH_USER",   "technomart"),
    "password": os.getenv("CH_PASS",   "technomart"),
}

KAFKA = {
    "bootstrap_servers": os.getenv("KAFKA_BROKERS", "127.0.0.1:32092"),
}

S3 = {
    "endpoint_url":          os.getenv("S3_ENDPOINT", "http://127.0.0.1:31566"),
    "bucket":                os.getenv("S3_BUCKET",   "technomart-datalake"),
    "region_name":           "ap-northeast-1",
    "aws_access_key_id":     "test",
    "aws_secret_access_key": "test",
}

# 生成データの出力先
DATA_DIR = os.getenv("DATA_DIR", "/tmp/technomart_data")
