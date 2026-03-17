FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# ネットワーク診断・汎用ツール
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    dnsutils \
    iputils-ping \
    netcat-openbsd \
    iproute2 \
    tcpdump \
    jq \
    vim \
    unzip \
    ca-certificates \
    gnupg \
    lsb-release \
    && rm -rf /var/lib/apt/lists/*

# PostgreSQL クライアント
RUN apt-get update && apt-get install -y postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Redis クライアント
RUN apt-get update && apt-get install -y redis-tools \
    && rm -rf /var/lib/apt/lists/*

# Kafka クライアント（kcat）
RUN apt-get update && apt-get install -y kcat \
    && rm -rf /var/lib/apt/lists/*

# ClickHouse クライアント
RUN curl -fsSL https://packages.clickhouse.com/deb/pool/main/c/clickhouse/clickhouse-client_24.8.15.35_amd64.deb -o /tmp/ch-client.deb \
    || curl -fsSL "https://packages.clickhouse.com/deb/pool/main/c/clickhouse/clickhouse-client_24.3.14.35_amd64.deb" -o /tmp/ch-client.deb \
    || true
RUN if [ -f /tmp/ch-client.deb ]; then \
        apt-get update && apt-get install -y /tmp/ch-client.deb 2>/dev/null || true; \
        rm /tmp/ch-client.deb; \
    fi

# AWS CLI（LocalStack接続用）
RUN curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscli.zip \
    && unzip -q /tmp/awscli.zip -d /tmp \
    && /tmp/aws/install \
    && rm -rf /tmp/awscli.zip /tmp/aws

# awslocal ラッパー（LocalStack向け）
RUN printf '#!/bin/bash\naws --endpoint-url=http://localstack.technomart.svc.cluster.local:4566 "$@"\n' \
    > /usr/local/bin/awslocal && chmod +x /usr/local/bin/awslocal

# デフォルト環境変数（PostgreSQL接続）
ENV PGHOST=postgresql.technomart.svc.cluster.local \
    PGPORT=5432 \
    PGDATABASE=technomart \
    PGUSER=technomart \
    PGPASSWORD=technomart

CMD ["sleep", "infinity"]
