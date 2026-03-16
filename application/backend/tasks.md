# Backend 実装タスク

## フェーズ概要

| Phase | 内容 | 主な成果物 |
|---|---|---|
| 1 | 基盤構築 | pyproject.toml, config, domain, JWT, DB接続 |
| 2 | 認証 | /auth/* エンドポイント, JWT middleware |
| 3 | Ops系 | /ops/* エンドポイント（health/kafka/pipeline/schema） |
| 4 | Business系 | /business/* エンドポイント（顧客/セグメント/Ollama） |
| 5 | 品質強化 | Integration test, Redis cache, 構造化ログ |

---

## 原則：機密情報の管理

- **接続情報・秘密鍵はすべて `.env` に記載し、コードにハードコードしない**
- `.env` は `.gitignore` で除外する。リポジトリには `.env.example`（値を空にしたテンプレート）のみコミットする
- `app/config.py` の `BaseSettings` が `.env` を読み込み、アプリ全体に供給する
- 対象となる主な設定値：
  - DB接続情報（host, port, user, password, dbname）
  - JWT秘密鍵（`JWT_SECRET_KEY`）
  - Ollama エンドポイント URL
  - LocalStack S3 エンドポイント・認証情報
  - Redis 接続情報

```
# .env.example
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=32432
POSTGRES_DB=technomart
POSTGRES_USER=technomart
POSTGRES_PASSWORD=

CLICKHOUSE_HOST=127.0.0.1
CLICKHOUSE_PORT=30823
CLICKHOUSE_DB=technomart
CLICKHOUSE_USER=technomart
CLICKHOUSE_PASSWORD=

REDIS_URL=redis://127.0.0.1:32379/0

KAFKA_BOOTSTRAP_SERVERS=127.0.0.1:32092

OLLAMA_BASE_URL=http://127.0.0.1:31434

S3_ENDPOINT_URL=http://127.0.0.1:31566
S3_BUCKET=technomart-datalake
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
AWS_DEFAULT_REGION=ap-northeast-1

JWT_SECRET_KEY=
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=480
```

---

## Phase 1: 基盤構築

| タスク | 内容 | 状態 |
|---|---|---|
| 1-1 | `pyproject.toml` — 依存パッケージ定義（fastapi, sqlalchemy[asyncio], asyncpg, clickhouse-driver, kafka-python-ng, redis, httpx, python-jose, structlog, boto3） | [x] |
| 1-2 | `app/config.py` — Pydantic BaseSettings。DB接続情報・JWT秘密鍵・Ollama URL等を環境変数から読み込み | [x] |
| 1-3 | `app/domain/value_objects/role.py` — Role Enum（admin/engineer/marketer/store_manager）と `can_access_ops()` / `can_access_business()` メソッド | [x] |
| 1-4 | `app/domain/value_objects/score.py` — ScoreRange（0〜100バリデーション付き） | [x] |
| 1-5 | `app/domain/value_objects/pagination.py` — Pagination値オブジェクト（page, per_page, total） | [x] |
| 1-6 | `app/domain/entities/user.py` — AuthUser（unified_id, role, store_id） | [x] |
| 1-7 | `app/domain/entities/customer.py` — UnifiedCustomer, ChurnLabel, CustomerScore | [x] |
| 1-8 | `app/domain/entities/segment.py` — SegmentLabel Enum（active/dormant/churned） | [x] |
| 1-9 | `app/domain/exceptions.py` — NotFoundError, UnauthorizedError, ForbiddenError | [x] |
| 1-10 | `app/shared/jwt.py` — `encode_token(user: AuthUser) -> str` / `decode_token(token: str) -> AuthUser`（python-jose使用） | [x] |
| 1-11 | `app/shared/logging.py` — structlogベースの構造化ロガー設定 | [x] |
| 1-12 | `app/infrastructure/database/postgres.py` — SQLAlchemy AsyncSession ファクトリ・`get_db` 依存関数・接続確認 | [x] |
| 1-13 | `app/infrastructure/database/clickhouse.py` — clickhouse-driver を `asyncio.to_thread` でラップ・接続確認 | [x] |
| 1-14 | `app/infrastructure/database/redis.py` — redis-py async クライアント・接続確認 | [x] |
| 1-15 | `app/main.py` — FastAPIアプリ骨格（CORS設定、グローバル例外ハンドラ、ルーター未登録でも `/healthz` が返る状態） | [x] |
| 1-16 | `tests/unit/domain/test_role.py` — Role の各メソッド検証 | [x] |
| 1-17 | `tests/unit/domain/test_score.py` — ScoreRange のバリデーション検証 | [x] |

---

## Phase 2: 認証

| タスク | 内容 | 状態 |
|---|---|---|
| 2-1 | `app/infrastructure/database/models.py` — usersテーブル ORMモデル（id, username, hashed_password, role, store_id） | [x] |
| 2-2 | `app/interfaces/repositories/user_repository.py` — IUserRepository Protocol（`find_by_username` 等） | [x] |
| 2-3 | `app/infrastructure/repositories/postgres_user_repository.py` — IUserRepository 実装 | [x] |
| 2-4 | `app/use_cases/auth/login.py` — LoginUseCase（パスワード検証 → JWT発行） | [x] |
| 2-5 | `app/use_cases/auth/get_me.py` — GetMeUseCase（JWTから現在ユーザー情報を返す） | [x] |
| 2-6 | `app/presentation/schemas/auth.py` — LoginRequest, TokenResponse, MeResponse | [x] |
| 2-7 | `app/presentation/middleware/auth_middleware.py` — `Authorization: Bearer` を検証し `request.state.current_user` に AuthUser を注入 | [x] |
| 2-8 | `app/dependencies.py` — `get_current_user`, `require_ops_role`, `require_business_role` DI関数 | [x] |
| 2-9 | `app/presentation/routers/auth.py` — POST /auth/login, POST /auth/logout, GET /auth/me | [x] |
| 2-10 | `tests/unit/use_cases/auth/test_login.py` — 正常ログイン / 存在しないユーザー / パスワード不一致 | [x] |
| 2-11 | `tests/e2e/test_auth_flow.py` — login → JWT取得 → /auth/me → logout の一連フロー | [x] |

---

## Phase 3: Ops系エンドポイント

| タスク | 内容 | 状態 |
|---|---|---|
| 3-1 | `app/interfaces/clients/kafka_client.py` — IKafkaAdminClient Protocol（`list_topics`, `list_consumer_groups`） | [x] |
| 3-2 | `app/infrastructure/clients/kafka_admin_client.py` — kafka-python-ng AdminClient ラッパー | [x] |
| 3-3 | `app/use_cases/ops/health_check.py` — PostgreSQL / ClickHouse / Kafka / Redis / Ollama への疎通を並列チェック | [x] |
| 3-4 | `app/use_cases/ops/get_kafka_topics.py` — トピック一覧・パーティション数・メッセージ数を取得 | [x] |
| 3-5 | `app/use_cases/ops/get_consumer_groups.py` — コンシューマグループ一覧と状態を取得 | [x] |
| 3-6 | `app/infrastructure/database/models.py` — pipeline_jobs / scoring_batches テーブル ORMモデル追記 | [x] |
| 3-7 | `app/interfaces/repositories/job_repository.py` — IJobRepository Protocol | [x] |
| 3-8 | `app/infrastructure/repositories/postgres_job_repository.py` — pipeline_jobs / scoring_batches の読み取り実装 | [x] |
| 3-9 | `app/use_cases/ops/get_pipeline_jobs.py` — ETLジョブ一覧・実行履歴・成功/失敗を取得 | [x] |
| 3-10 | `app/use_cases/ops/get_scoring_batches.py` — バッチ実行履歴・最終実行日時・次回予定を取得 | [x] |
| 3-11 | `app/interfaces/repositories/schema_repository.py` — ISchemaRepository Protocol | [x] |
| 3-12 | `app/infrastructure/repositories/postgres_schema_repository.py` — information_schema からテーブル定義を取得 | [x] |
| 3-13 | `app/use_cases/ops/get_schema_tables.py` — テーブル定義（カラム名・型・制約）を取得 | [x] |
| 3-14 | `app/presentation/schemas/ops.py` — HealthResponse, TopicInfo, ConsumerGroupInfo, JobInfo, BatchInfo, TableSchema | [x] |
| 3-15 | `app/presentation/routers/ops.py` — GET /ops/health, /ops/kafka/topics, /ops/kafka/consumer-groups, /ops/pipeline/jobs, /ops/scoring/batches, /ops/schema/tables | [x] |
| 3-16 | `tests/unit/use_cases/ops/test_health_check.py` — 各サービスの正常/障害ケースをモックで検証 | [x] |
| 3-17 | `tests/unit/use_cases/ops/test_get_kafka_topics.py` | [x] |
| 3-18 | `tests/unit/use_cases/ops/test_get_scoring_batches.py` | [x] |
| 3-19 | `tests/integration/clients/test_kafka_admin_client.py` — 実Kafkaへの接続・トピック一覧取得 | [x] |
| 3-20 | `tests/e2e/test_ops_endpoints.py` — engineerトークンで全opsエンドポイントが200 / marketerトークンで403 | [x] |

---

## Phase 4: Business系エンドポイント

| タスク | 内容 | 状態 |
|---|---|---|
| 4-1 | `app/infrastructure/database/models.py` — unified_customers, customer_source_map, churn_labels, customer_scores ORMモデル追記 | [x] |
| 4-2 | `app/interfaces/repositories/customer_repository.py` — ICustomerRepository Protocol（find_by_id, find_all, search） | [x] |
| 4-3 | `app/infrastructure/repositories/postgres_customer_repository.py` — ICustomerRepository 実装（churn_labels / customer_scores JOIN含む） | [x] |
| 4-4 | `app/use_cases/business/list_customers.py` — 顧客一覧取得。store_manager ロールの場合は store_id でフィルタ | [x] |
| 4-5 | `app/use_cases/business/get_customer.py` — 顧客詳細（チャネル横断の購買履歴・スコア） | [x] |
| 4-6 | `app/interfaces/repositories/analytics_repository.py` — IAnalyticsRepository Protocol | [x] |
| 4-7 | `app/infrastructure/repositories/clickhouse_analytics_repository.py` — ec_events / pos_transactions / churn_summary_weekly 等のクエリ実装 | [x] |
| 4-8 | `app/use_cases/business/get_summary.py` — KPIサマリ（アクティブ顧客数・チャーン率・週次売上推移） | [x] |
| 4-9 | `app/use_cases/business/get_segment_summary.py` — active/dormant/churned の分布 | [x] |
| 4-10 | `app/use_cases/business/get_segment_trend.py` — セグメント週次推移（churn_summary_weekly から取得） | [x] |
| 4-11 | `app/use_cases/business/get_sales_analytics.py` — チャネル別・カテゴリ別売上（sales_by_channel から取得） | [x] |
| 4-12 | `app/use_cases/business/get_affinity.py` — 属性×カテゴリの親和性ヒートマップ（category_affinity_summary から取得） | [x] |
| 4-13 | `app/interfaces/clients/llm_client.py` — ILLMClient Protocol（`generate(prompt: str) -> str`, `embed(text: str) -> list[float]`） | [x] |
| 4-14 | `app/infrastructure/clients/ollama_client.py` — httpx で Ollama REST API を呼び出す ILLMClient 実装（qwen2.5:3b / nomic-embed-text） | [x] |
| 4-15 | `app/infrastructure/repositories/postgres_product_repository.py` — pgvector 類似検索（`embedding <-> $1` クエリ） | [x] |
| 4-16 | `app/use_cases/business/get_recommendations.py` — nomic-embed-text で顧客Embeddingを生成 → pgvector で類似商品を返す | [x] |
| 4-17 | `app/use_cases/business/natural_language_query.py` — 日本語クエリをqwen2.5:3bに投げ、スキーマ情報をプロンプトに含めてSQL/回答を生成 | [x] |
| 4-18 | `app/presentation/schemas/business.py` — CustomerList, CustomerDetail, SegmentSummary, SalesTrend, AffinityMatrix, NLQueryResponse | [x] |
| 4-19 | `app/presentation/routers/business.py` — GET /business/summary, /customers, /customers/{id}, /customers/{id}/recommendations, /segments/summary, /segments/trend, /analytics/sales, /analytics/affinity, POST /business/query | [x] |
| 4-20 | `tests/unit/use_cases/business/test_list_customers.py` — store_managerは自store_idのみ / marketerは全件 / ページネーション | [x] |
| 4-21 | `tests/unit/use_cases/business/test_get_customer.py` | [x] |
| 4-22 | `tests/unit/use_cases/business/test_get_recommendations.py` — pgvector検索結果の件数・順序を検証 | [x] |
| 4-23 | `tests/unit/use_cases/business/test_natural_language_query.py` — Ollamaモックが返したテキストがレスポンスに含まれること | [x] |
| 4-24 | `tests/integration/repositories/test_postgres_customer_repository.py` — unified_customers CRUD / churn_labels JOIN / pgvector 類似検索 | [x] |
| 4-25 | `tests/integration/repositories/test_clickhouse_analytics_repository.py` — 集計クエリ・フィルタの検証 | [x] |
| 4-26 | `tests/integration/clients/test_ollama_client.py` — /api/generate / /api/embeddings 呼び出し | [x] |
| 4-27 | `tests/e2e/test_business_endpoints.py` — store_managerが他店舗データを取得できないこと / 顧客詳細の全フィールド検証 / ロール別アクセス制御 | [x] |

---

## Phase 5: 品質強化

| タスク | 内容 | 状態 |
|---|---|---|
| 5-1 | `app/presentation/middleware/logging_middleware.py` — リクエストID付与・リクエスト/レスポンスの構造化ログ出力 | [ ] |
| 5-2 | `app/infrastructure/clients/redis_cache_client.py` — ICacheClient 実装（get/set/delete、TTL付き） | [ ] |
| 5-3 | `app/interfaces/clients/cache_client.py` — ICacheClient Protocol | [ ] |
| 5-4 | `get_customer` ユースケースに Redis cache-aside パターンを組み込み（Redis優先参照 → キャッシュミス時にPostgreSQLから取得） | [ ] |
| 5-5 | グローバル例外ハンドラの整備（NotFoundError→404, ForbiddenError→403, UnauthorizedError→401 に変換） | [ ] |
| 5-6 | `tests/integration/repositories/test_postgres_schema_repository.py` | [ ] |
| 5-7 | `tests/conftest.py` — 共通フィクスチャの整備（TestClient, DBセッション、テストユーザーのセットアップ/ティアダウン） | [ ] |
| 5-8 | pytest-cov でカバレッジ計測・80%以上を目標に補完 | [x] |

---

## Phase 6: コンテナ化・k3sデプロイ

> **本番対応方針**: ローカルはk3s、本番はEKS。マニフェストは共通で、接続先（環境変数）の差し替えのみで移行できる構成にする。

| タスク | 内容 | 状態 |
|---|---|---|
| 6-1 | `application/backend/Dockerfile` — マルチステージビルド（builder: 依存インストール / runtime: 最小イメージ）。uvicorn で起動 | [x] |
| 6-2 | `application/frontend/Dockerfile` — Next.js の standalone ビルドを使用したマルチステージビルド | [x] |
| 6-3 | `application/backend/.env.example` をリポジトリにコミット。`.env` 本体は `.gitignore` で除外 | [x] |
| 6-4 | `infrastructure/k8s/backend/manifest.yaml` — Deployment（レプリカ1）+ ClusterIP Service + ConfigMap（非機密設定）+ Secret（DB接続情報・JWT秘密鍵） | [x] |
| 6-5 | `infrastructure/k8s/frontend/manifest.yaml` — Deployment + NodePort Service（フロントエンドはブラウザから直接アクセスするため NodePort） | [x] |
| 6-6 | `infrastructure/k8s/backend/manifest.yaml` に `BACKEND_URL` 等の環境変数を Secret / ConfigMap から注入する設定を追加 | [x] |
| 6-7 | `infrastructure/scripts/deploy.sh` にバックエンド・フロントエンドの apply を追記 | [x] |
| 6-8 | VM上でイメージビルド（`docker build`）→ k3s のローカルレジストリへのインポート（`k3s ctr images import`）手順を確認・実施 | [x] |
| 6-9 | `kubectl rollout status` で backend / frontend の起動を確認。`/healthz` エンドポイントで疎通確認 | [x] |
| 6-10 | `infrastructure/NETWORK.md` にバックエンド・フロントエンドのポート情報を追記 | [x] |

### ポート割り当て（予定）

| サービス | NodePort |
|---|---|
| backend (FastAPI) | 30800 |
| frontend (Next.js) | 30080 |

### ローカル vs 本番の差分

| 項目 | ローカル（k3s） | 本番（EKS） |
|---|---|---|
| イメージレジストリ | k3s ローカルインポート | ECR |
| 機密情報 | k8s Secret（手動作成） | AWS Secrets Manager → External Secrets |
| DB接続先 | k3s内 ClusterIP | RDS エンドポイント（環境変数のみ変更） |
| ストレージ | LocalStack S3 | S3（エンドポイント変数のみ変更） |
| マニフェスト変更 | なし（環境変数差し替えのみ） | なし |
