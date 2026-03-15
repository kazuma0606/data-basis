# data-basis

中規模リテール企業向けデータ基盤のローカル構築プロジェクト。

VirtualBox VM上に本番AWS環境の縮小再現を構築し、複数システムに分散した顧客データを統合・活用するデータ基盤とアプリケーション層を実装する。

---

## 想定ユースケース

架空クライアント「株式会社テクノマート」（家電量販店チェーン、10店舗、会員20万人）を対象に、以下を実現する。

- **チャネル横断の顧客統合**: ECサイト・実店舗POS・会員アプリにサイロ化したデータを名寄せして統合顧客マスタを構築する
- **潜在顧客スコアリング**: 閲覧・購買・来店の弱いシグナルを積み上げてカテゴリ親和性スコアを算出し、バッチでサジェストを生成する
- **チャーン分析**: アクティブ/休眠/チャーンを分類し、マーケ施策のターゲティングに使う

---

## 技術スタック

| レイヤー | ローカル環境 | 本番（AWS想定） |
|---|---|---|
| コンテナ基盤 | k8s on VirtualBox VM | EKS |
| ストリーミング | Kafka | Amazon MSK |
| オブジェクトストレージ | LocalStack (S3互換) | S3 |
| アプリDB | PostgreSQL + pgvector | RDS PostgreSQL |
| 分析DB | ClickHouse | ClickHouse on EC2 |
| キャッシュ | Redis | ElastiCache |
| LLM | Ollama (Gemma2, nomic-embed-text) | Amazon Bedrock |
| IaC | Terraform (LocalStack provider) | Terraform (AWS provider) |
| フロントエンド | Next.js + ShadCN | 同左 |
| バックエンド | FastAPI + SQLAlchemy | 同左 |

外部LLM API（Claude API, OpenAI等）は使用しない。

---

## リポジトリ構成

```
data-basis/
  plan/                   # プロジェクト全体の要件・設計ドキュメント
  infrastructure/         # インフラコード（Terraform / k8s / Kafka）
  application/
    frontend/             # Next.js + ShadCN
    backend/              # FastAPI + SQLAlchemy
    example/              # デザインモック（v0.app）
  verification/           # ローカル検証（SQLiteベース）
```

---

## クイックスタート（検証環境）

本番VM構築の前に、SQLiteベースで汚れたSynthetic Dataを生成・確認できる。

```bash
cd verification

# 依存関係のインストールとデータ生成
uv run python generate.py

# 生成データの検証レポート表示
uv run python verify.py
```

**検証で確認できる内容:**
- 同一人物が EC / POS / アプリに別IDで存在（名寄せ対象）
- 電話番号フォーマットの5種混在、和暦/西暦の混在、都道府県表記の揺れ
- チャーン分布（active 20% / dormant 40% / churned 30% / dead 10%）
- 退会処理漏れ（チャーン顧客の約90%が削除フラグなし）
- EC / POS 間の商品コード体系の差異

---

## 設計ドキュメント

| ファイル | 内容 |
|---|---|
| `plan/company.md` | 発注元（テクノマート）の背景・制約・プロジェクト構図 |
| `plan/user_story.md` | ユーザーストーリー・潜在スコアリング設計 |
| `plan/data_problems.md` | 既存データの問題点・Synthetic Data方針 |
| `plan/architecture.md` | インフラ全体構成・本番/ローカルの対応表 |
| `plan/data_schema.md` | テーブル設計・Kafkaトピック対応 |
| `application/plan/app_requirements.md` | ダッシュボード・API・認証設計 |
