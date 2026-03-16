# Frontend 実装タスク

## フェーズ概要

| Phase | 内容 | 主な成果物 |
|---|---|---|
| 1 | 基盤構築 | Next.js + ShadCN + API client + 認証抽象化層 + middleware.ts |
| 2 | 認証UI | /auth/login ページ |
| 3 | Ops系ダッシュボード | /ops/* 全ページ（engineer向け） |
| 4 | Business系ダッシュボード | /business/* 全ページ（marketer/store_manager向け） |
| 5 | 品質強化 | エラー境界・ローディング・型安全APIクライアント |
| 6 | コンテナ化・k3sデプロイ | Dockerfile・k8sマニフェスト・deploy.sh追記 |

---

## 原則

### 状態管理
- **グローバル状態管理ライブラリは使用しない**（Redux・Zustand等は不要）
- 認証状態: `lib/auth/session.ts` の `getSession()`（サーバー）/ `useAuth()`（クライアント）
- サーバーデータ: Next.js Server Components で `fetch`（ほとんどのページはこれで完結）
- フィルタ・ページネーション: URL searchParams（共有・ブックマーク可）
- ローカルUI状態: `useState` / `useReducer`
- ポーリングが必要な画面（Kafkaモニタリング等）: SWR を局所的に使用

### 認証アーキテクチャ（プロバイダ疎結合設計）

認証ロジックはアブストラクション層で完全に分離する。
`middleware.ts` / Server Components は `lib/auth` の公開APIのみを呼ぶ。
**プロバイダの切り替えは `lib/auth/index.ts` の1行のみで完結**。

```
lib/auth/
  types.ts          # AuthUser・Role の型定義（プロバイダ非依存）
  provider.ts       # IAuthProvider インターフェース
  providers/
    fastapi.ts      # 現在: FastAPI JWT を httpOnly cookie に保存・jose で検証
    # 将来例: cognito.ts（Cognitoトークン検証）/ auth0.ts 等
  index.ts          # export { fastapiProvider as authProvider } — 切り替えはここだけ
  session.ts        # サーバー側: cookie 読み取り → provider.verifyToken() → AuthUser
  client.tsx        # クライアント側: AuthContext + useAuth() フック
```

- JWT検証: **`jose`**（Auth.js非依存・Edge Runtime対応）
- セッション保存: **httpOnly cookie**（プロバイダ共通の保存方式）
- ローカル → Cognito 切り替え時の変更範囲:
  1. `lib/auth/providers/cognito.ts` を追加
  2. `lib/auth/index.ts` の export 先を変更
  3. 環境変数（JWKS URI等）を差し替え
  4. アプリコードの変更ゼロ

### 機密情報
- `BACKEND_URL`・`AUTH_COOKIE_SECRET`（cookie署名用）は `.env.local` に記載
- `.env.local` は `.gitignore` で除外、`.env.example` のみコミット

### スタイル・UI
- ShadCN + Tailwind CSS
- `application/example/` のデザインモックに準拠
- 日本語UI・ダークモード対応

---

## テスト戦略

### レイヤー構成

| レイヤー | ツール | 対象 | 実行タイミング |
|---|---|---|---|
| Unit | Jest + React Testing Library | `lib/auth/`・`lib/api.ts`・`middleware.ts`・Pure関数 | ローカル / CI |
| Component | Jest + RTL | 各ページ・コンポーネント（APIはmsw/fetch mockで代替） | ローカル / CI |
| E2E | Playwright | 実バックエンド（192.168.56.10:30800）に対してロールフロー全体 | ローカル（VM起動中） |

### テスト設計方針

- **Unit**: `lib/auth/` の `verifyToken`・`getSession` は jest の cookie mock で検証。プロバイダ実装は jest.mock で差し替え
- **Component**: `fetch` を `jest.mock` または `msw` でモック。Server Components は `jest-environment-jsdom` ではなくテスト用レンダラを使用
- **E2E (Playwright)**:
  - ターゲット: `next dev`（ローカル）+ 実バックエンド `http://192.168.56.10:30800`
  - テストユーザー: PostgreSQL に事前投入済みの engineer / marketer / store_manager（ID=1）
  - 前提: バックエンドが起動済みであること（`@playwright/test` の `webServer` 設定でフロントのみ起動）
  - ロール別アクセス制御・リダイレクト・データ表示の全フローを検証

### テストユーザー（E2E用）

バックエンドのPostgreSQLに以下のユーザーが存在することを前提とする。
不足時は `infrastructure/scripts/seed_users.sql` でセット。

| username | password | role | store_id |
|---|---|---|---|
| engineer | engineer123 | engineer | null |
| marketer | marketer123 | marketer | null |
| store_manager | manager123 | store_manager | 1 |

---

## Phase 1: 基盤構築

| タスク | 内容 | 状態 |
|---|---|---|
| 1-1 | `package.json` — Next.js 15 + TypeScript + Tailwind + ShadCN + `jose` + SWR + Jest + RTL + Playwright の依存定義 | [x] |
| 1-2 | ShadCN 初期設定（`components.json`・`cn()` utility・基本コンポーネント追加） | [x] |
| 1-3 | `lib/auth/types.ts` — `AuthUser`（userId, username, role, storeId）・`Role` 型 | [x] |
| 1-4 | `lib/auth/provider.ts` — `IAuthProvider` インターフェース（`signIn` / `signOut` / `verifyToken`） | [x] |
| 1-5 | `lib/auth/providers/fastapi.ts` — FastAPI `/auth/login` を呼び JWT を httpOnly cookie に保存。`jose` で署名検証 | [x] |
| 1-6 | `lib/auth/index.ts` — `export { fastapiProvider as authProvider }`（切り替えはここのみ） | [x] |
| 1-7 | `lib/auth/session.ts` — `getSession(): Promise<AuthUser \| null>`（Server Components・middleware 用） | [x] |
| 1-8 | `lib/auth/client.tsx` — `AuthContext` + `useAuth()` フック（Client Components 用） | [x] |
| 1-9 | `app/api/auth/signin/route.ts` — ログインAPIルート（provider.signIn → cookie セット） | [x] |
| 1-10 | `app/api/auth/signout/route.ts` — ログアウトAPIルート（cookie クリア） | [x] |
| 1-11 | `lib/api.ts` — FastAPI への fetch ラッパー（cookie から JWT を読み取り Bearer token として付与） | [x] |
| 1-12 | `lib/types.ts` — FastAPIレスポンスの型定義（Customer, KpiSummary, TopicInfo 等） | [x] |
| 1-13 | `middleware.ts` — `getSession()` でロール取得 → role によるリダイレクト制御（auth実装に依存しない） | [x] |
| 1-14 | `.env.example` — `BACKEND_URL`・`AUTH_COOKIE_SECRET`（cookie署名用）のテンプレート | [x] |
| 1-15 | Jest 設定（`jest.config.ts`・`jest.setup.ts`）— Next.js + TypeScript + RTL 環境構築 | [x] |
| 1-16 | Playwright 設定（`playwright.config.ts`）— `baseURL: http://localhost:3000`・`webServer` で `next dev` 自動起動 | [x] |
| 1-17 | `tests/unit/lib/auth/verifyToken.test.ts` — `verifyToken` の正常・期限切れ・不正署名ケース | [x] |
| 1-18 | `tests/unit/lib/auth/session.test.ts` — cookie mock で `getSession` の有無・デコード検証 | [x] |
| 1-19 | `tests/unit/middleware.test.ts` — 未認証リダイレクト・role別ルーティングロジック検証 | [x] |
| 1-20 | `tests/unit/lib/api.test.ts` — Bearer token 自動付与・401/403/5xx エラーハンドリング検証 | [x] |

---

## Phase 2: 認証UI

| タスク | 内容 | 状態 |
|---|---|---|
| 2-1 | `app/auth/login/page.tsx` — ログインフォーム（username/password・react-hook-form + zod）・エラー表示 | [x] |
| 2-2 | ログイン成功後のロール別リダイレクト（engineer → /ops/overview、marketer → /business/summary） | [x] |
| 2-3 | `tests/component/LoginForm.test.tsx` — フォームレンダリング・バリデーション・APIエラー表示の検証 | [x] |
| 2-4 | `tests/e2e/auth.spec.ts` — 実バックエンドに対してログイン成功・失敗・ロール別リダイレクト・ログアウト | [x] |

---

## Phase 3: Ops系ダッシュボード

| タスク | 内容 | 状態 |
|---|---|---|
| 3-1 | `app/ops/layout.tsx` — サイドバー（Overview/Kafka/Pipeline/Scoring/Schema）・ヘッダー・ログアウト | [x] |
| 3-2 | `app/ops/overview/page.tsx` — ヘルスチェック（各サービスの状態バッジ一覧） | [x] |
| 3-3 | `app/ops/kafka/page.tsx` — トピック一覧・パーティション数・メッセージ数（SWRで30秒ポーリング） | [x] |
| 3-4 | `app/ops/pipeline/page.tsx` — ETLジョブ実行履歴（ステータス・処理件数・実行時間） | [x] |
| 3-5 | `app/ops/scoring/page.tsx` — バッチ実行履歴・最終実行日時・次回予定 | [x] |
| 3-6 | `app/ops/schema/page.tsx` — テーブル定義一覧（カラム名・型・NULL制約） | [x] |
| 3-7 | `tests/component/ops/*.test.tsx` — 各Opsページのレンダリング検証（APIレスポンスをfetch mockで注入） | [x] |
| 3-8 | `tests/e2e/ops.spec.ts` — engineer でログイン → 各ページ表示確認・marketer でアクセス → リダイレクト確認 | [x] |

---

## Phase 4: Business系ダッシュボード

| タスク | 内容 | 状態 |
|---|---|---|
| 4-1 | `app/business/layout.tsx` — サイドバー（Summary/Customers/Segments/Affinity/Query）・ヘッダー | [ ] |
| 4-2 | `app/business/summary/page.tsx` — KPIカード（アクティブ顧客数・チャーン率・週次売上）+ 売上推移チャート | [ ] |
| 4-3 | `app/business/customers/page.tsx` — 顧客一覧（セグメントフィルタ・ページネーション・URL searchParams管理） | [ ] |
| 4-4 | `app/business/customers/[id]/page.tsx` — 顧客詳細（チャーンラベル・スコア・サジェスト商品） | [ ] |
| 4-5 | `app/business/segments/page.tsx` — セグメント分布（円グラフ）+ 週次推移（折れ線グラフ） | [ ] |
| 4-6 | `app/business/affinity/page.tsx` — カテゴリ親和性ヒートマップ（属性×カテゴリ） | [ ] |
| 4-7 | `app/business/query/page.tsx` — 自然言語クエリUI（入力欄・送信・回答表示） | [ ] |
| 4-8 | `tests/component/business/*.test.tsx` — 各Businessページのレンダリング検証（fetch mock） | [ ] |
| 4-9 | `tests/e2e/business.spec.ts` — marketer でログイン → 各ページ表示・顧客詳細ナビゲーション | [ ] |
| 4-10 | `tests/e2e/store_manager.spec.ts` — store_manager でログイン → 自店舗データのみ表示・engineer でアクセス → リダイレクト | [ ] |

---

## Phase 5: 品質強化

| タスク | 内容 | 状態 |
|---|---|---|
| 5-1 | `app/error.tsx` / 各ルートの `error.tsx` — エラー境界（API障害時のフォールバックUI） | [ ] |
| 5-2 | `app/loading.tsx` / 各ルートの `loading.tsx` — Suspenseベースのローディング骨格（Skeleton） | [ ] |
| 5-3 | `lib/api.ts` の型安全強化 — レスポンス型の厳密化・エラー型の統一 | [ ] |
| 5-4 | チャートコンポーネントの整備（ShadCN Charts で折れ線・棒・円グラフを共通化） | [ ] |
| 5-5 | `tests/e2e/resilience.spec.ts` — バックエンドエラー時のフォールバックUI表示確認 | [ ] |

---

## Phase 6: コンテナ化・k3sデプロイ

> backend タスク 6-2・6-5・6-7(frontend部分) の対応

| タスク | 内容 | 状態 |
|---|---|---|
| 6-1 | `application/frontend/Dockerfile` — Next.js standalone ビルドのマルチステージ構成 | [ ] |
| 6-2 | `infrastructure/k8s/frontend/manifest.yaml` — Deployment + NodePort:30300 + ConfigMap（BACKEND_URL等） | [ ] |
| 6-3 | `infrastructure/scripts/deploy.sh` にフロントエンドのビルド・インポート・apply を追記 | [ ] |
| 6-4 | VM上でビルド・k3sインポート・rollout確認・ブラウザ疎通確認（http://192.168.56.10:30300） | [ ] |
