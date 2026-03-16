# アプリケーション要件

## 概要

データ基盤の上に乗るアプリケーション層。利用者のロールによって2つのダッシュボードに分かれる。

- **Opsダッシュボード**: データ基盤自体の監視・管理（エンジニア向け）
- **ビジネスダッシュボード**: 顧客分析・施策立案（マーケ・店長向け）

---


## 技術スタック

| レイヤー | 技術 |
|---|---|
| フロントエンド | Next.js (App Router) + ShadCN |
| バックエンド | FastAPI + SQLAlchemy |
| 認証 | Auth.js (NextAuth) + JWT |
| LLM | Ollama (完全ローカル) |
| 外部LLM API | 使用しない |

---

## ロール設計

| ロール | アクセス範囲 | 備考 |
|---|---|---|
| `admin` | /ops/* + /business/* | 全機能アクセス可 |
| `engineer` | /ops/* のみ | テクノマートIT部門・ベンダーエンジニア |
| `marketer` | /business/* のみ | 全店舗横断で閲覧可 |
| `store_manager` | /business/* のみ | APIレスポンスを自store_idでフィルタ |

`store_manager`は`marketer`と同一ルートだが、バックエンドAPIがJWTのstore_idを参照して自動的に自店舗データのみ返す。フロントエンドの実装は共通。

---

## Next.js ルーティング構成

```
app/
  middleware.ts              ← 認証チェック + ロール振り分け
  auth/
    login/page.tsx
  ops/                       ← engineer, admin のみ
    layout.tsx               ← Opsサイドバー・ヘッダー
    overview/page.tsx        ← インフラ全体のヘルスチェック
    kafka/page.tsx           ← トピック・lag・throughput監視
    database/page.tsx        ← 接続状況・行数・クエリ遅延
    pipeline/page.tsx        ← ETLジョブの実行状況
    scoring/page.tsx         ← バッチ実行履歴・次回実行
    schema/page.tsx          ← テーブル定義の参照
  business/                  ← marketer, store_manager, admin
    layout.tsx               ← Businessサイドバー・ヘッダー
    summary/page.tsx         ← アクティブ顧客数・チャーン率・週次傾向
    customers/
      page.tsx               ← 顧客一覧（セグメントフィルタ付き）
      [id]/page.tsx          ← 顧客詳細（チャネル横断履歴・スコア・サジェスト）
    segments/page.tsx        ← アクティブ/休眠/チャーンの分布・推移
    affinity/page.tsx        ← カテゴリ親和性（属性×カテゴリのヒートマップ）
    query/page.tsx           ← 自然言語クエリ（Ollama経由）
```

### middleware.tsのロジック

```
未認証              → /auth/login にリダイレクト
engineer            → /ops/* は通過、/business/* アクセス時は /ops/overview へ
marketer            → /business/* は通過、/ops/* アクセス時は /business/summary へ
store_manager       → /business/* は通過、/ops/* アクセス時は /business/summary へ
admin               → すべて通過
```

---

## Opsダッシュボード 画面仕様

モック（application/example）をベースに実装する。

| 画面 | 主なデータソース | 説明 |
|---|---|---|
| 概要 | 各サービスのヘルスAPI | Kafka/DB/Pipeline/Scoringの状態を一覧 |
| Kafka | Kafka Admin API | トピック一覧・パーティション・lag・throughput |
| データベース | PostgreSQL/ClickHouse | 接続状況・主要テーブルの行数・最終更新 |
| パイプライン | ジョブ管理DB | ETLジョブの実行履歴・成功/失敗・処理件数 |
| スコアリング | バッチ管理DB | バッチ最終実行日時・処理件数・次回予定 |
| スキーマ | PostgreSQL情報スキーマ | テーブル定義・カラム・型の参照 |

---

## ビジネスダッシュボード 画面仕様

| 画面 | 主なデータソース | 説明 |
|---|---|---|
| サマリ | PostgreSQL + ClickHouse | KPI概要（アクティブ数・チャーン率・週次売上推移） |
| 顧客一覧 | PostgreSQL | セグメント・スコアでフィルタ可能な顧客リスト |
| 顧客詳細 | PostgreSQL + ClickHouse | チャネル横断の購買履歴・スコア推移・サジェスト商品 |
| セグメント | ClickHouse | アクティブ/休眠/チャーンの分布と時系列推移 |
| カテゴリ親和性 | ClickHouse | 属性（年代・性別）×カテゴリのヒートマップ |
| 自然言語クエリ | Ollama + PostgreSQL/ClickHouse | 日本語でのアドホック分析 |

---

## FastAPI エンドポイント設計

### Ops系

```
GET  /ops/kafka/topics                  トピック一覧・メッセージ数・lag
GET  /ops/kafka/consumer-groups         コンシューマグループ状態
GET  /ops/pipeline/jobs                 ETLジョブ一覧・実行履歴
GET  /ops/scoring/batches               バッチ実行履歴
GET  /ops/schema/tables                 テーブル定義一覧
GET  /ops/health                        インフラ全体のヘルスチェック
```

### Business系

```
GET  /business/summary                  KPIサマリ
GET  /business/customers                顧客一覧（セグメント・スコアでフィルタ）
GET  /business/customers/{id}           顧客詳細（チャネル横断）
GET  /business/customers/{id}/recommendations  サジェスト商品
GET  /business/segments/summary         セグメント分布
GET  /business/segments/trend           セグメント推移（週次）
GET  /business/analytics/sales          チャネル別売上（ClickHouse）
GET  /business/analytics/affinity       カテゴリ親和性
POST /business/query                    自然言語クエリ（Ollama）
```

### 認証

```
POST /auth/login                        ログイン（JWT発行）
POST /auth/logout                       ログアウト
GET  /auth/me                           現在のユーザー情報・ロール
```

---

## 認証フロー

```
Next.js (Auth.js)
  └─ credentials provider でFastAPIの /auth/login を呼ぶ
  └─ JWTにrole・store_idを含める
  └─ middleware.tsでJWTを検証してルーティング制御

FastAPI
  └─ JWTをデコードしてrole・store_idを取得
  └─ store_managerの場合はstore_idで自動フィルタ
```

---

## デザイン方針

- モック（application/example）のデザインをベースにする
- ShadCNコンポーネントを使用
- 日本語UI
- ダークモード対応（モックに準拠）
