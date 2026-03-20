# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

中規模リテール企業（架空：株式会社テクノマート）向けのデータ基盤を、VirtualBox VM上にローカル構築するプロジェクト。本番AWSの縮小再現として設計されており、Terraformコードは本番移行時に最小変更で対応できることを前提とする。

外部LLM API（Claude API, OpenAI等）は**一切使用しない**。LLMはOllama（完全ローカル）のみ。

## リポジトリ構成

```
data-basis/
  versions/             # バージョン別 計画・タスク・仕様書
    v1.0/               # 要件・設計ドキュメント（初版）
    v1.1/               # 運用安定化（k3s自動起動・ローカルレジストリ等）
    v1.1.1/             # Pod状態可視化
    v1.1.2/             # デプロイ改善
    v1.2/               # データフロー実装（名寄せ・Kafka・スコアリング）
    v1.2.1/             # 未着手（将来）
    v1.2g/              # CI/CD基盤整備（gitleaks・ruff・mypy・pre-commit）
    v1.3/               # 監視・オブザーバビリティ（Prometheus・Grafana）← 現在
    v1.3.1/             # 未着手（将来）
  infrastructure/       # インフラコード
    vagrant/            # VM管理（Vagrantfile）← VM起動はここ
    terraform/          # 将来：VM内サービスプロビジョニング用（現在は未使用）
    k8s/                # Kubernetesマニフェスト
    kafka/              # Kafkaトピック・コネクタ設定
    data/               # Synthetic Data（VMと共有またはrsync）
    scripts/            # データ生成・初期投入スクリプト
  application/          # アプリケーションコード
    frontend/           # Next.js + ShadCN
    backend/            # FastAPI + SQLAlchemy
    example/            # v0.appで作成したデザインモック
  verification/         # ローカル検証（SQLiteベース）
```

## verification/ の使い方

Synthetic Dataの動作確認用。SQLiteで汚れたデータを生成し、名寄せ・クレンジングパイプラインの検証に使う。

```bash
cd verification
uv run python generate.py            # 500人分のデータ生成（デフォルト）
uv run python generate.py --count 1000  # 人数を指定
uv run python verify.py              # 汚れデータの検証レポート表示
```

Windows での文字コード問題は generate.py / verify.py 内で自動処理済み（`sys.stdout.reconfigure`）。

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
- デザインは `application/example/` のモックに準拠

**ビジネスダッシュボード** (`/business/`) — マーケ・店長向け
- 顧客セグメント分析、カテゴリ親和性、顧客詳細（チャネル横断）、自然言語クエリ（Ollama）

### LLM（Ollama）の用途

- `qwen2.5:3b`: 通知文生成、自然言語クエリ応答（日本語対応、ローカル軽量モデル）
- `nomic-embed-text`: 商品・顧客のEmbedding生成（pgvectorで類似検索）
- ※ 本番（Bedrock）では llama4 を想定。抽象化レイヤー経由で切り替え可能にする。
- LLMクライアントは抽象化レイヤー経由で呼び出す（将来のBedrock切り替えを想定）

## Synthetic Dataの設計方針

リアリティのために意図的に「汚れ」を入れる（`verification/` で検証済み）：
- 同一人物が EC / POS / アプリに別IDで存在（名寄せ対象、500人中254人）
- 電話番号フォーマットが5種類混在（標準・ハイフンなし・+81・suffix付き・欠損）
- POSの生年月日は和暦（S55, H15, R3）、ECは西暦
- 都道府県が正式名称・略称・数字コードで混在
- 20万件中アクティブは約4万人、残りは休眠・チャーン・退会漏れ
- 商品コードはECとPOSで体系が異なる（`EC0001` vs `POS-C0001`）

データは `infrastructure/data/` に置き、VMとの共有またはrsyncで同期する。

## 設計ドキュメント

- `versions/v1.0/company.md` — 発注元（テクノマート）の背景・制約
- `versions/v1.0/user_story.md` — ユーザーストーリー・スコアリング設計
- `versions/v1.0/data_problems.md` — 既存データの問題点
- `versions/v1.0/architecture.md` — インフラ全体構成
- `versions/v1.0/data_schema.md` — テーブル設計・Kafkaトピック対応
- `application/plan/app_requirements.md` — ダッシュボード・API・認証設計
- `versions/v1.2/spec.md` — 認証・K8s全Pod・デプロイ手順の詳細仕様書
- `versions/v1.3/plan.md` — 監視スタック設計・SLI/SLO・アラート閾値
- `versions/v1.3/tasks.md` — v1.3 タスクリスト（現在のバージョン）
