# 開発ノート

実装・デバッグ過程で遭遇した問題と解決策の記録。
同じ状況に再び陥ったときの手がかりとして残す。

---

## フロントエンド（Next.js）

### ShadCN ChartContainer と ResizeObserver

**状況**: Jest（jsdom環境）で recharts を使ったチャートコンポーネントのテストを実行すると `ResizeObserver is not defined` が発生。

**原因**: ShadCN の `ChartContainer` が内部で `ResponsiveContainer` を使っており、これは `ResizeObserver` に依存している。jsdom はこの API を実装していない。

**解決**: `jest.setup.ts` にモックを追加。

```typescript
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
```

---

### ShadCN CardTitle はヘッダー要素ではない

**状況**: Playwright E2E テストで `getByRole('heading', { name: /ログイン/ })` が要素を見つけられない。

**原因**: ShadCN の `CardTitle` は `<div>` としてレンダリングされる（`<h1>〜<h6>` ではない）。

**解決**: テストのセレクタを変更。

```typescript
// NG
page.getByRole('heading', { name: /ログイン/ })

// OK
page.getByText("ログイン", { exact: true }).first()
// または、ページに <h1> を直接置く（アクセシビリティ的にも推奨）
```

---

### Next.js 15 の async params / searchParams

**状況**: Server Component でページを実装すると TypeScript が `params.id` の直接アクセスに警告を出す。

**原因**: Next.js 15 では `params` と `searchParams` が `Promise<...>` になった。

**解決**:

```typescript
// page.tsx
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // ...
}
```

---

### Playwright の waitForURL とクエリパラメータ

**状況**: `waitForURL("**/auth/login")` がタイムアウトする。

**原因**: middleware がリダイレクト先に `?from=/ops/overview` を付加するため、実際の URL が `/auth/login?from=...` になる。glob パターン `**/auth/login` はクエリパラメータを含む URL にマッチしない。

**解決**: パターンの末尾に `**` を追加。

```typescript
// NG
await page.waitForURL("**/auth/login");

// OK
await page.waitForURL("**/auth/login**");
```

---

### Playwright の strict mode 違反（複数要素マッチ）

**状況**: サイドバーナビゲーションとページ本文に同じテキストが存在するため、`getByText("顧客一覧")` が複数要素にマッチしてエラーになる。

**解決のパターン**:

| 状況 | 対処 |
|---|---|
| ページ見出し（`<h1>`）を狙う | `getByRole("heading", { name: "顧客一覧" })` |
| 完全一致が必要 | `getByText("セグメント構成", { exact: true })` |
| テーブル内のリンク | `page.locator("table a").first()` |
| Dropdown 内の要素 | トリガーをクリックしてから参照 |

---

### DropdownMenu 内のテキストはクリック前に検出できない

**状況**: `BusinessHeader` のロールラベル（"店舗マネージャー"）が `getByText(/店舗マネージャー/)` で見つからない。

**原因**: ShadCN の `DropdownMenuContent` はトリガーをクリックするまで DOM に存在しない（または `visibility: hidden`）。

**解決**: テスト内でトリガーボタンをクリックしてから参照。

```typescript
await page.getByRole("button", { name: /store_manager/ }).click();
await expect(page.getByText(/店舗マネージャー/)).toBeVisible();
```

---

## バックエンド（FastAPI / JWT）

### フロントエンドの signIn が form-urlencoded を送っていた

**状況**: ログインが 422 Unprocessable Entity を返す。

**原因**: `fastapi.ts` の `signIn` が `Content-Type: application/x-www-form-urlencoded` と `URLSearchParams` で送信していたが、バックエンドの `/auth/login` は `application/json` の `LoginRequest` を期待している。

**解決**: `fastapi.ts` を JSON送信に変更。

```typescript
// 修正前
headers: { "Content-Type": "application/x-www-form-urlencoded" },
body: new URLSearchParams({ username, password }),

// 修正後
headers: { "Content-Type": "application/json" },
body: JSON.stringify({ username, password }),
```

---

### JWT ペイロード構造の不一致

**状況**: ログインに成功してトークンを取得しても、フロントエンドの `verifyToken` が `null` を返す（実際はトークン検証自体は通るが、フィールドマッピングが壊れている）。

**原因**: バックエンドが発行する JWT のペイロード構造と、フロントエンドが期待する構造が異なっていた。

| フィールド | バックエンドの実際値 | フロントエンドが期待していた値 |
|---|---|---|
| `sub` | user_id（文字列 `"1"`） | username（`"engineer"`） |
| `username` | `"engineer"` | 存在しない（`user_id` を想定） |

**解決**: `fastapi.ts` の `JwtPayload` インターフェースと `verifyToken` の読み取りを修正。

```typescript
interface JwtPayload {
  sub: string;        // user_id as string (e.g. "1")
  username: string;   // login name
  role: Role;
  store_id: number | null;
  exp: number;
}

// 読み取り
return {
  userId: parseInt(p.sub, 10),
  username: p.username,
  // ...
};
```

---

### AUTH_COOKIE_SECRET とバックエンドの JWT_SECRET_KEY を揃える

**状況**: フロントエンドの `verifyToken` が常に `null` を返す（JWT 検証失敗）。

**原因**: フロントエンドの `.env.local` の `AUTH_COOKIE_SECRET` とバックエンドの `JWT_SECRET_KEY`（k8s Secret）が別の文字列になっていた。JWT は署名したシークレットと同じシークレットでしか検証できない。

**解決**: `.env.local` の `AUTH_COOKIE_SECRET` をバックエンドの `JWT_SECRET_KEY` と一致させる。

```
# .env.local
AUTH_COOKIE_SECRET=change-me-generate-with-openssl-rand-hex-32

# infrastructure/k8s/backend/manifest.yaml
JWT_SECRET_KEY: "change-me-generate-with-openssl-rand-hex-32"
```

> 本番では `openssl rand -hex 32` で生成した値を両方に設定すること。

---

## インフラ / k3s

### k3s コンテナイメージ再インポートの必要性

**状況**: k3s ノード再起動後にバックエンド Pod が `ErrImageNeverPull` で起動しない。

**原因**: `imagePullPolicy: Never` の場合、k3s の containerd イメージキャッシュはノード再起動で消える。

**解決**: ビルド・デプロイのたびに再インポートが必要。

```bash
docker build -t backend:latest .
docker save backend:latest | sudo k3s ctr images import -
kubectl rollout restart deployment/backend -n technomart
```

---

### Readiness Probe に認証が必要なエンドポイントを使ってはいけない

**状況**: バックエンド Pod が `Unhealthy` のまま Ready にならない。Readiness probe が失敗し続ける。

**原因**: `/api/auth/me` を probe に設定していたが、このエンドポイントは JWT が必要で 401 を返す。

**解決**: 認証不要のヘルスチェックエンドポイントを probe に使う。

```yaml
# 修正前
readinessProbe:
  httpGet:
    path: /api/auth/me

# 修正後（フロントエンドの公開ページ）
readinessProbe:
  httpGet:
    path: /auth/login
```

---

## データベース / スキーマ

### データパイプラインのスキーマとバックエンドモデルの不一致

**状況**: 顧客一覧 API (`/business/customers`) が 500 Internal Server Error を返す。ログに `relation "unified_customers" already exists` ＋ `column "unified_id" does not exist`。

**原因**: `initial_data.sh` で投入された `unified_customers` テーブルはデータパイプライン独自のスキーマ（`id UUID`、`canonical_name` 等）を使っており、バックエンドの SQLAlchemy モデル（`unified_id INTEGER`、`name_kanji` 等）と一致していなかった。

**解決**: `infrastructure/scripts/migrate_schema.sql` で差分を埋める移行を実施。

- `unified_customers` に `unified_id SERIAL` カラムを追加
- `name_kanji`・`name_kana`・`resolution_score` カラムを追加し `canonical_name` からコピー
- `churn_labels` を UUID 参照から INTEGER 参照に再作成

```bash
# VM 内での実行手順
kubectl cp migrate_schema.sql technomart/<postgres-pod>:/tmp/migrate_schema.sql
kubectl exec -n technomart <postgres-pod> -- psql -U technomart -d technomart -f /tmp/migrate_schema.sql
```

> 本番環境では Alembic などのマイグレーションツールを使い、この種のスキーマドリフトを防ぐこと。

---

### VM への SQL ファイル転送方法

`psql` が VM に入っていない場合は、PostgreSQL Pod の内部 `psql` を使う。

```bash
KEY="infrastructure/vagrant/production/.vagrant/machines/default/virtualbox/private_key"

# ファイルを VM に転送
scp -i "$KEY" -o StrictHostKeyChecking=no my_script.sql vagrant@192.168.56.10:/tmp/

# Pod にコピーして実行
ssh -i "$KEY" vagrant@192.168.56.10 "
  kubectl cp /tmp/my_script.sql technomart/<postgres-pod>:/tmp/my_script.sql &&
  kubectl exec -n technomart <postgres-pod> -- psql -U technomart -d technomart -f /tmp/my_script.sql
"
```

---

## E2E テスト全般

### Playwright 実行前のチェックリスト

1. `application/frontend/.env.local` が存在し、`BACKEND_URL` と `AUTH_COOKIE_SECRET` が正しい
2. VM が起動しており、バックエンドが `http://192.168.56.10:30800` で応答している
3. `infrastructure/scripts/seed_users.sql` が適用済みで DB にテストユーザーが存在する
4. Chromium がインストールされている（`npx playwright install chromium`）

### Jest 実行前のチェックリスト

- `jest.setup.ts` に `ResizeObserver` のモックが含まれている（recharts 用）
- コンポーネントテストで `apiFetch` を複数回モックする場合、コンポーネントが呼ぶ回数分 `mockResolvedValueOnce` / `mockRejectedValueOnce` を連鎖させる

```typescript
// 顧客詳細ページは apiFetch を 2 回呼ぶ（顧客 + レコメンド）
mockApiFetch
  .mockRejectedValueOnce(new Error("エラー"))
  .mockResolvedValueOnce([]);  // 2回目も忘れずに
```
