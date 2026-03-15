# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

中規模リテール企業（架空：株式会社テクノマート）向けのデータ基盤を、VirtualBox VM上にローカル構築するプロジェクト。本番AWSの縮小再現として設計されており、Terraformコードは本番移行時に最小変更で対応できることを前提とする。

外部LLM API（Claude API, OpenAI等）は**一切使用しない**。LLMはOllama（完全ローカル）のみ。

## リポジトリ構成

```
data-basis/
  infrastructure/
    plan/             # インフラ設計ドキュメント
    terraform/        # LocalStack provider によるIaC
    k8s/              # Kubernetesマニフェスト
    kafka/            # Kafkaトピック・コネクタ設定
    data/             # Synthetic Data（VMと共有またはrsync）
    scripts/          # データ生成・初期投入スクリプト
  application/
    plan/             # アプリケーション設計ドキュメント
    frontend/         # Next.js + ShadCN
    backend/          # FastAPI + SQLAlchemy
    example/          # v0.appで作成したデザインモック
```

## 環境

### ホストマシン
- Intel Core Ultra 7 265KF / RAM 128GB / Windows 11
- VirtualBox VM: Ubuntu 24.04 LTS / 10コア / 48GB RAM / 200GB

### 本番 vs ローカルの対応

| 役割 | 本番（AWS） | ローカル |
|---|---|---|
| コンテナ基盤 | EKS | k8s on VM |
| オブジェクトストレージ | S3 | LocalStack |
| ストリーミング | Amazon MSK | Kafka on k8s |
| アプリDB | RDS PostgreSQL | PostgreSQL on k8s |
| 分析DB | ClickHouse | ClickHouse on k8s |
| キャッシュ | ElastiCache (Redis) | Redis on k8s |
| LLM | Amazon Bedrock | Ollama on k8s |

## アーキテクチャ

データフローは以下の順で流れる：

```
Synthetic Data（ソース層）
  └─ Kafka Connect / バッチ取り込み
        ↓
Kafka（ストリーミング）
  ├─ → S3（生データを全量保持。消さない）
  └─ → スコアリングサービス（バッチ日次/週次）
        ↓
PostgreSQL + pgvector（統合・サービング層）
  └─ 名寄せ済み統合顧客マスタ・スコア・Embedding
ClickHouse（分析層）
  └─ S3からの日次ロード、集計クエリ専用
Redis
  └─ スコアのリアルタイムキャッシュ（TTL 24h）
        ↓
FastAPI（API層）
  └─ Next.jsフロントエンドへ
```

### PostgreSQL vs ClickHouseの使い分け

- **PostgreSQL**: 個別顧客レコードの参照・更新、現在の状態管理、アプリが使う
- **ClickHouse**: 大量データの集計・分析（マーケ・店長向けダッシュボード）、S3から日次ロード

### スコアリング方針

フェーズ1はバッチスコアリングのみ（リアルタイムは将来）。

| スコア | 更新頻度 |
|---|---|
| カテゴリ親和性 | 日次 |
| チャーンリスク | 週次 |
| 購買タイミング | 週次 |
| 来店予測 | 週次 |

弱いシグナル（page_view、scroll_depth、dwell_time）は単体では使わず、複数を組み合わせてスコアに変換する。

## アプリケーション

### ロールとルーティング

Next.js `middleware.ts` でJWT検証 → ロールに応じてルーティング。

| ロール | アクセス先 |
|---|---|
| `engineer` | `/ops/*` のみ |
| `marketer` | `/business/*` のみ（全店舗横断） |
| `store_manager` | `/business/*`（APIがstore_idで自動フィルタ） |
| `admin` | 両方 |

### ダッシュボード

**Opsダッシュボード** (`/ops/`) — エンジニア・IT部門向け
- Kafka監視、パイプライン実行状況、スコアリングバッチ状況、スキーマ参照
- デザインはapplication/exampleのモックに準拠

**ビジネスダッシュボード** (`/business/`) — マーケ・店長向け
- 顧客セグメント分析、カテゴリ親和性、顧客詳細（チャネル横断）、自然言語クエリ（Ollama）

### LLM（Ollama）の用途

- `gemma2`: 通知文生成、自然言語クエリ応答
- `nomic-embed-text`: 商品・顧客のEmbedding生成（pgvectorで類似検索）
- LLMクライアントは抽象化レイヤー経由で呼び出す（将来のBedrock切り替えを想定）

## Synthetic Dataの方針

リアリティのために意図的に「汚れ」を入れる：
- 同一人物が EC / POS / アプリに別IDで存在（名寄せ対象）
- 電話番号・住所・氏名のフォーマットばらつき、和暦と西暦の混在
- 20万件中アクティブは約4万人、残りは休眠・チャーン・退会漏れ
- 商品コードはECとPOSで体系が異なる（基幹マスタが正）

データは `infrastructure/data/` に置き、VMとの共有またはrsyncで同期する。

## 設計ドキュメント

詳細は以下を参照：

- `infrastructure/plan/company.md` — 発注元（テクノマート）の背景・制約
- `infrastructure/plan/user_story.md` — ユーザーストーリー・スコアリング設計
- `infrastructure/plan/data_problems.md` — 既存データの問題点
- `infrastructure/plan/architecture.md` — インフラ全体構成
- `infrastructure/plan/data_schema.md` — テーブル設計・Kafkaトピック対応
- `application/plan/app_requirements.md` — ダッシュボード・API・認証設計
