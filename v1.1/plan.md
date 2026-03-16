# v1.1 アップデート計画

作成日: 2026-03-16

## 背景

v1.0でローカルインフラの疎通確認が完了。
全サービス（Kafka / Redis / PostgreSQL / ClickHouse / LocalStack / Ollama / Backend / Frontend）がk3s上で稼働し、
ダッシュボードの基本的な表示が確認できた状態。

v1.1は「基盤として実際に機能する状態」にすることを目標とする。

---

## スコープ

### 1. ユーザー管理機能

**背景**: 現状ユーザーはDBへの直接INSERTで管理しており、運用に耐えない。

**実装内容**:
- `POST /auth/users` — adminロールのみが叩けるユーザー作成API
- `GET /auth/users` — ユーザー一覧取得（admin用）
- `PATCH /auth/users/{id}` — ロール変更・有効/無効切替
- パスワードのbcryptハッシュ化
- 初期パスワード設定フロー（作成時に仮パスワードを返す）
- `/ops/users` — 管理画面（ユーザー一覧・作成・ロール変更フォーム）

**ロール定義（現行）**:
| ロール | アクセス先 |
|---|---|
| `engineer` | `/ops/*` のみ |
| `marketer` | `/business/*`（全店舗） |
| `store_manager` | `/business/*`（自分のstore_idのみ） |
| `admin` | `/ops/*` + `/business/*` + ユーザー管理 |

---

### 2. Kafkaパイプライン実装

**背景**: 現状はサンプルデータをDBに直接投入しているだけ。
synthetic dataをKafka経由で流すパイプラインがなければ基盤として機能しない。

**実装内容**:
- Kafka Connectの設定（ソースコネクタ）
- synthetic dataをKafkaトピックにプロデュース
  - `ec.events` — EC閲覧・購買・カートイベント
  - `pos.transactions` — POSレジデータ
  - `app.behaviors` — アプリ行動ログ
  - `inventory.updates` — 在庫変動
- Kafkaコンシューマー実装
  - → S3（LocalStack）への生データ書き出し（raw/）
  - → PostgreSQLへの取り込み（ステージングテーブル）

---

### 3. 名寄せパイプライン

**背景**: EC / POS / アプリで同一人物が別IDで存在する。
`unified_customers`テーブルが実データで埋まっていないと全体が機能しない。
synthetic dataには意図的に以下の汚れを入れてある（verification/で検証済み）:
- 500人中254人が複数システムに別IDで存在
- 電話番号フォーマット5種類混在
- 生年月日が和暦（S55, H15等）と西暦混在
- 都道府県が正式名称・略称・数字コード混在

**実装内容**:
- クレンジング処理
  - 電話番号の正規化（E.164 or ハイフンあり統一）
  - 生年月日の西暦統一（和暦→西暦変換）
  - 都道府県コードの統一
- 名寄せロジック
  - マッチングキー: 電話番号 / メールアドレス / 氏名+生年月日
  - `customer_source_map`テーブルへの対応関係記録
  - `unified_customers`テーブルへの統合レコード生成
- 実行: バッチ（日次）、初回は全件処理

---

### 4. スコアリングバッチ本体

**背景**: ClickHouseに入っているのはサンプルデータのみ。
実際のスコア計算ロジックを実装し、パイプラインと接続する。

**スコア種別と更新頻度**:
| スコア | 更新頻度 | 主なインプット |
|---|---|---|
| カテゴリ親和性 | 日次 | EC購買履歴・POS購買履歴 |
| チャーンリスク | 週次 | 最終購買日・来店頻度・休眠期間 |
| 購買タイミング | 週次 | 購買間隔の分布 |
| 来店予測 | 週次 | 来店履歴・曜日/時間帯パターン |

**実装内容**:
- スコアリングサービス（Pythonバッチ）
- Kubernetes CronJobとして定義
- 結果をPostgreSQLの`customer_scores`へ書き込み
- RedisへのTTL 24hキャッシュ
- ClickHouseへの集計テーブル更新

---

## ローカルだから今やっておくべきこと（本番移行前に確定）

### Terraform整備
- 現在未使用
- LocalStack providerで構成をコード管理
- 本番AWS移行時に差分最小化

### pgvector Embedding生成
- Ollama `nomic-embed-text` で商品・顧客のEmbedding生成バッチ
- `product_embeddings`テーブルへの格納
- 類似商品推薦・類似顧客検索の基盤

### ClickHouse S3日次ロードETL
- S3（aggregated/）→ ClickHouseのETLジョブ設計と検証
- Kubernetes CronJobとして定義

### シードデータ投入の自動化
- `deploy.sh`実行後に完全な状態になるよう初期データ投入スクリプトを整備
- 現在: 手動でClickHouseにCURLでデータ投入が必要な状態

### 障害シナリオテスト（ローカルだから試せる）
- Podを意図的に落としてデータ欠損が起きないか確認
- PVCのデータ永続化確認（ClickHouse / PostgreSQL / Ollama）
- Kafka offset管理の確認（コンシューマーが途中から再開できるか）

---

### 5. Nginx Ingress Controller導入

**背景**:
現状はフロントエンド(:30300)・バックエンド(:30800)をそれぞれNodePortで直接外部公開している。
これには以下の問題がある。

- バックエンドAPIが外部から直接叩ける（JWTはあるが、エンドポイントが露出している）
- フロントとバックで別ポートになっており、本番構成と乖離している
- HTTPのため`SECURE_COOKIES: "false"`というハックが必要になっている
- ヘルスチェック・ルーティングがk8sのIngressとして管理されていない

**CORSとの関係**:
CORSはブラウザが自主的に守るルールであり、サーバー側のアクセス制御ではない。
`curl`やサーバー間通信はCORSを無視できる。
現状のバックエンドアクセス制御はJWTが担っており、CORSはあくまで補助的な役割。
Nginx Ingressを入れることで「バックエンドをCluster-IP化し、外部から直接到達できなくする」
ネットワークレベルの制御が加わる。

**実装内容**:
- Nginx Ingress Controllerのk8sマニフェスト追加
- ルーティング設定
  - `/` → frontend (Next.js)
  - `/api/` → backend (FastAPI) ※バックエンドはCluster-IPに変更（NodePort廃止）
- SSL証明書の設定（自己署名でも可）→ `SECURE_COOKIES: "false"` ハックの解消
- バックエンドのServiceタイプを `NodePort` → `ClusterIP` に変更

**AWS移行時の対応**:
- AWS Load Balancer Controller（ALB）がNginx Ingressの前段に入る
- または ALB が直接k8s Serviceにルーティングする構成に切り替え
- ローカルでNginx Ingressを使っておくことで、ルーティングルールがそのまま流用できる

```
【ローカル（v1.1以降）】
ブラウザ → :80/:443 → Nginx Ingress → / → frontend
                                      → /api/ → backend (ClusterIP)

【AWS移行後】
ブラウザ → ALB → Nginx Ingress → / → frontend
                               → /api/ → backend (ClusterIP)
```

---

## 優先順位

```
Phase 1（基盤完成）
├── 3. 名寄せパイプライン   ← unified_customers を実データで埋める
└── 2. Kafkaパイプライン    ← データフローを実際に流す

Phase 2（機能追加）
├── 4. スコアリングバッチ本体
└── 1. ユーザー管理機能

Phase 3（本番移行準備・インフラ整備）
├── 5. Nginx Ingress Controller導入  ← バックエンド非公開化・SSL化
├── Terraform整備
├── pgvector Embedding生成
└── ClickHouse S3日次ロードETL
```

※ Phase 3のNginx Ingressはv1.2（監視）より先に完了させる。
　 PrometheusやGrafanaもIngress経由でアクセスする構成になるため。

---

## 現在の技術スタック（v1.0時点）

| レイヤー | 技術 | バージョン/備考 |
|---|---|---|
| VM | VirtualBox + Ubuntu 24.04 | 10コア / 48GB RAM |
| コンテナ基盤 | k3s | 192.168.56.10 |
| ストリーミング | Kafka (KRaft) | :32092 |
| アプリDB | PostgreSQL + pgvector | :32432 |
| 分析DB | ClickHouse | HTTP :30823 / native :30900 |
| キャッシュ | Redis | :32379 |
| オブジェクトストレージ | LocalStack S3 | :31566 |
| LLM | Ollama (qwen2.5:3b, nomic-embed-text) | :31434 |
| バックエンド | FastAPI | :30800 |
| フロントエンド | Next.js 15 + ShadCN | :30300 |
