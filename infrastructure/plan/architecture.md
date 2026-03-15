# アーキテクチャ設計

## 基本方針

- ローカルVM（VirtualBox + Ubuntu LTS）上に本番AWS環境の縮小再現を構築する
- 外部API依存なし。LLMも含めて完全ローカルで完結させる
- Terraformで全構成をコード管理し、本番AWS移行時の差分を最小化する

---

## 本番 vs ローカル環境の対応

| 役割 | 本番（AWS想定） | ローカル（今回） |
|---|---|---|
| コンテナ基盤 | EKS | k8s on VirtualBox VM |
| オブジェクトストレージ | S3 | LocalStack (S3互換) |
| ストリーミング | Amazon MSK (Kafka) | Kafka on k8s |
| 統合顧客マスタ・アプリDB | RDS PostgreSQL | PostgreSQL on k8s |
| 分析・集計DB | ClickHouse (EC2 or managed) | ClickHouse on k8s |
| リアルタイムキャッシュ | ElastiCache (Redis) | Redis on k8s |
| ベクトル検索 | pgvector (RDS拡張) | pgvector (PostgreSQL拡張) |
| LLM | Amazon Bedrock | Ollama on k8s |
| IaC | Terraform (AWS provider) | Terraform (LocalStack provider) |

---

## 全体アーキテクチャ

```
【データソース（Synthetic Data）】
  ECシステム (MySQL)
  POSシステム (SQL Server相当)
  会員アプリ (PostgreSQL)
  在庫・基幹 (CSV/Oracle相当)
        │
        │ Kafka Connect / バッチ取り込み
        ▼
【ストリーム・取り込み層】
  Kafka (on k8s)
  ├─ topic: ec.events          # 閲覧・購買・カートイベント
  ├─ topic: pos.transactions   # POSレジデータ
  ├─ topic: app.behaviors      # アプリ行動ログ
  └─ topic: inventory.updates  # 在庫変動
        │
        ├─────────────────────────────────┐
        ▼                                 ▼
【リアルタイム処理層】           【バッチ処理層】
  Kafka Streams / ksqlDB          S3 (LocalStack)
  ├─ 潜在スコアリング             ├─ raw/          # 生データ全量
  ├─ チャーン検知                 ├─ cleaned/      # クレンジング済み
  └─ 異常検知                    └─ aggregated/   # 集計済み
        │                                 │
        ▼                                 ▼
【サービング層】
  PostgreSQL + pgvector
  ├─ 統合顧客マスタ（名寄せ済み）
  ├─ チャーン・アクティブ分類
  └─ Embedding（商品・顧客）

  ClickHouse
  └─ 分析・集計クエリ（マーケ・店長向けダッシュボード）

  Redis
  └─ 潜在スコアのリアルタイムキャッシュ
        │
        ▼
【アプリケーション層】
  Ollama (on k8s) ─ Gemma2
  ├─ Embedding生成（nomic-embed-text）
  ├─ 通知文の自動生成
  └─ 店舗スタッフ向け自然言語クエリ

  API Server (FastAPI)
  └─ マーケ・店長・社内ダッシュボードへ
```

---

## コンポーネント詳細

### Kafka トピック設計（概要）

| トピック | 生産者 | 消費者 | 用途 |
|---|---|---|---|
| ec.events | ECシステム | スコアリング, S3 | 閲覧・購買・カートイベント |
| pos.transactions | POSシステム | スコアリング, S3 | レジ購買データ |
| app.behaviors | 会員アプリ | スコアリング, S3 | アプリ行動ログ |
| inventory.updates | 在庫システム | S3, ClickHouse | 在庫変動 |
| customer.scores | スコアリングサービス | Redis, 通知サービス | 潜在スコア更新 |

### PostgreSQL 主要テーブル（概要）

| テーブル | 内容 |
|---|---|
| unified_customers | 名寄せ済み統合顧客マスタ |
| customer_source_map | 各システムのIDと統合IDの対応 |
| churn_labels | アクティブ/休眠/チャーンの分類 |
| product_embeddings | 商品のベクトル表現 |

### S3 バケット構成

```
s3://technomart-datalake/
  ├─ raw/ec/YYYY/MM/DD/          # EC生ログ
  ├─ raw/pos/YYYY/MM/DD/         # POS生データ
  ├─ raw/app/YYYY/MM/DD/         # アプリ生ログ
  ├─ cleaned/customers/          # クレンジング済み顧客データ
  └─ aggregated/                 # 集計済みデータ（ClickHouse投入前）
```

### Ollama（ローカルLLM）

| モデル | 用途 |
|---|---|
| gemma2 | テキスト生成（通知文、クエリ応答） |
| nomic-embed-text | Embedding生成（商品・顧客の類似検索） |

外部LLM API（Claude API, OpenAI等）は使用しない。完全ローカルで完結させる。
本番移行時は Amazon Bedrock への切り替えを想定し、LLMクライアントは抽象化レイヤー経由で呼び出す。

---

## リポジトリ構成（予定）

```
data-basis/
  plan/               # 設計ドキュメント
  terraform/          # インフラ定義（LocalStack provider）
  k8s/                # Kubernetesマニフェスト
  kafka/              # Kafkaトピック・コネクタ設定
  data/               # Synthetic Data（VMと共有）
  services/           # アプリケーションサービス
    scoring/          # 潜在スコアリングサービス
    api/              # FastAPI サーバー
    llm/              # Ollamaクライアント抽象化レイヤー
  scripts/            # データ生成・初期投入スクリプト
```

---

## VM スペック割り当て（予定）

ホストマシン: Intel Core Ultra 7 265KF / RAM 128GB

| リソース | 割り当て |
|---|---|
| CPU | 10コア |
| RAM | 48GB |
| ストレージ | 200GB |
| OS | Ubuntu 24.04 LTS |
