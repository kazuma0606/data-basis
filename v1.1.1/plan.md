# v1.1.1 アップデート計画 — Pod 状態可視化（k8s ダイレクト / 認証不要）

作成日: 2026-03-17
前提: v1.1 完了後（toolbox / Fluent Bit / ローカルレジストリ構築済み）

---

## 目的

現在の Ops ダッシュボードは「FastAPI バックエンドが返すサービスヘルス」しか見えない。
k8s の Pod 実態（Restart 回数・起動からの経過時間・デプロイバージョン）はブラウザから確認できない。

**v1.1.1 では Next.js から k8s API に直接アクセスし、Pod 状態をストリーミング表示する。**

FastAPI は一切触らない。

---

## 認証設計の前提を変える

最初の設計では Pod 監視を `/ops/*` 配下（engineer 認証必須）に置こうとしていたが、
これは間違いだった。

### なぜ認証不要にするか

```
業務データ（顧客情報・売上・スコア）  →  認証必要（当然）
インフラ状態（Pod 状態・バージョン）  →  認証不要でよい
```

理由は2つ:

**1. 鶏と卵の問題**
認証基盤（FastAPI / JWT）自体が壊れたとき、ログインできなければ Pod 状態を確認できない。
「何が壊れているか確認するためにログインが必要」は本末転倒。

**2. GET only = 読み取り専用 = リスクなし**
Pod の名前・状態・Restart 数・バージョンを外部に見せてもセキュリティ上のリスクはない。
Prometheus の `/metrics`、k8s の `/healthz`、GitHub の status page が認証不要なのと同じ発想。

### パスを `/ops/*` から分離する

`/ops/*` は middleware の認証フローに巻き込まれる。
Pod 監視は `/status/*` という独立したパスに置き、middleware のスキップリストに追加する。

```
/ops/*      → 認証必須（engineer / admin）  ← 既存のまま
/business/* → 認証必須（marketer / store_manager / admin）  ← 既存のまま
/status/*   → 認証不要（新設）  ← Pod 監視・バージョン確認
/api/healthz → 認証不要（新設）  ← 機械向けヘルスチェック
/api/status/* → 認証不要（新設）  ← SSE ストリームの API 側
```

---

## 背景：「VM が立ち上がっているか」問題の整理

```
Next.js が HTTP レスポンスを返している
  → VM は起動している（自明）
  → k3s も起動している（Next.js が k8s Pod として稼働しているため）
```

実質的に意味のある確認は次の3層:

| レベル | 確認内容 | 確認手段 |
|---|---|---|
| L1 | VM + k3s 起動 | Next.js が応答する = 自明 |
| L2 | k8s API server 健全 | `GET /api/healthz` で k8s API 疎通確認 |
| L3 | 各 Pod の Running 状態 | `GET /status` でリアルタイム表示 |

---

## スコープ

### 1. `GET /api/healthz` — 機械向けヘルスチェック（認証不要）

Prometheus scrape や外部監視ツールが叩くエンドポイント。

```json
GET /api/healthz → 200 OK
{
  "nextjs": "ok",
  "k8s_api": "ok" | "error",
  "k8s_error": "connection refused",   // エラー時のみ
  "pods": {
    "running": 11,
    "pending": 0,
    "failed": 0,
    "unknown": 0
  }
}
```

- 常に 200 を返す（k8s が壊れていても `nextjs: "ok"` は返る）
- 外部監視ツールが `k8s_api: "error"` を検知してアラートを上げる想定

### 2. `GET /api/status/pods/stream` — SSE ストリーム（認証不要）

k8s watch API（NDJSON）を Server-Sent Events に変換してブラウザに流す。

```
k8s API                                 Next.js Route Handler       ブラウザ
  NDJSON: {"type":"ADDED","object":{}}  →  data: {...}\n\n    →    EventSource
  NDJSON: {"type":"MODIFIED",...}       →  data: {...}\n\n    →    useReducer で Pod リスト更新
  NDJSON: {"type":"DELETED",...}        →  data: {...}\n\n    →    削除アニメーション
```

- 認証不要
- k8s watch が切れたら `retry: 3000` ディレクティブでブラウザが自動再接続
- 流すのは Pod 名・ステータス・Restart 数・起動時間・イメージタグのみ

### 3. `GET /status` — Pod 監視 UI（認証不要）

ブラウザで開く監視ページ。ログイン画面を経由しない。

```
/status
  ├─ クラスター概要バー: 全 Pod 数 / Running / 異常
  ├─ デプロイバージョン: versions/status.sh 相当の情報
  │     prod/backend: v1.1-04b359d / deployed: 2026-03-17 07:07
  │     prod/frontend: v1.1-04b359d / deployed: 2026-03-17 07:07
  └─ Pod グリッド（リアルタイム）
        各カード: Pod 名 / ステータス（色分け） / READY / RESTART / AGE / イメージタグ
```

Pod グリッドは SSE で自動更新。ページリロード不要。

デプロイバージョンは `versions/deployments.db`（SQLite）を Server Component が直接読む。
FastAPI を経由しない（DB ファイルはホスト側ファイルシステムにあるため、同じマウントを使う）。

---

## 技術的な仕組み

### k8s API へのアクセス

```typescript
// lib/k8s.ts
import fs from "fs";
import https from "https";

const K8S_API = "https://kubernetes.default.svc.cluster.local";

function getToken() {
  return fs.readFileSync(
    "/var/run/secrets/kubernetes.io/serviceaccount/token",
    "utf-8"
  ).trim();
}

function getCa() {
  return fs.readFileSync(
    "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt"
  );
}

export async function k8sFetch(path: string, init?: RequestInit) {
  // Node.js の fetch は TLS カスタム CA をサポートしていないため
  // NODE_EXTRA_CA_CERTS 環境変数か、tls オプションで対応
  return fetch(`${K8S_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      ...(init?.headers as Record<string, string>),
    },
  });
}
```

`@kubernetes/client-node` は使わない。標準 `fetch` + Node.js `fs` だけで完結する。

> **TLS 注意**: k8s API は HTTPS のため、CA 証明書の検証が必要。
> Next.js の Dockerfile に `NODE_EXTRA_CA_CERTS=/var/run/secrets/kubernetes.io/serviceaccount/ca.crt`
> を ENV として追加するか、`NODE_TLS_REJECT_UNAUTHORIZED=0`（開発環境限定）で回避する。

### k8s watch API → SSE 変換

```typescript
// app/api/status/pods/stream/route.ts
export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const res = await k8sFetch(
        "/api/v1/namespaces/technomart/pods?watch=true&resourceVersion=0"
      );

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";          // 末尾の不完全な行を保持

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);    // {"type":"ADDED","object":{...}}
          const pod = toPodInfo(event);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(pod)}\n\n`)
          );
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",            // Nginx プロキシ対応
    },
  });
}
```

### デプロイバージョンの取得

`/status` ページは Server Component として `versions/deployments.db` を直接読む。

```typescript
// lib/versions.ts
import Database from "better-sqlite3";   // または child_process で sqlite3 コマンド
import path from "path";

const DB_PATH = path.join(process.cwd(), "../../versions/deployments.db");
// /technomart/application/frontend からの相対パスで /technomart/versions/deployments.db

export function getCurrentDeployments() {
  const db = new Database(DB_PATH, { readonly: true });
  return db.prepare(
    "SELECT environment, service, semver, git_hash, deployed_at FROM current_state ORDER BY environment, service"
  ).all();
}
```

> **代替案**: `child_process` で `sqlite3` コマンドを叩く（依存追加なし）。
> `better-sqlite3` を使う場合は `package.json` に追加が必要。どちらでも動く。

### RBAC 設計

```yaml
ServiceAccount: frontend-sa (namespace: technomart)

ClusterRole: technomart-pod-reader
  rules:
    - resources: ["pods"]   verbs: ["get", "list", "watch"]
    - resources: ["nodes"]  verbs: ["get", "list"]

ClusterRoleBinding: frontend-pod-reader
  subjects: ServiceAccount/frontend-sa
  roleRef:  ClusterRole/technomart-pod-reader
```

### middleware の変更

```typescript
// 認証スキップリストに /status と /api/healthz と /api/status を追加
if (
  pathname.startsWith("/_next") ||
  pathname.startsWith("/api/ops/") ||
  pathname.startsWith("/api/business/") ||
  pathname.startsWith("/api/auth/signout") ||
  pathname.startsWith("/api/auth/me") ||
  pathname === "/" ||
  // 以下を追加
  pathname === "/api/healthz" ||
  pathname.startsWith("/api/status/") ||
  pathname.startsWith("/status")
) {
  return NextResponse.next();
}
```

---

## 変更ファイル一覧

### k8s マニフェスト

```
infrastructure/k8s/frontend/manifest.yaml
  └─ ServiceAccount + ClusterRole + ClusterRoleBinding 追加
     Deployment に serviceAccountName: frontend-sa 追加
```

### Next.js フロントエンド

```
application/frontend/
  lib/k8s.ts                              # k8s API クライアント
  lib/versions.ts                         # deployments.db 読み取り
  lib/types.ts                            # PodInfo / PodEvent / ClusterHealth 型追加
  app/api/healthz/route.ts                # 認証不要 / 機械向けヘルスチェック
  app/api/status/pods/stream/route.ts     # 認証不要 / SSE ストリーム
  app/status/page.tsx                     # 認証不要 / Pod 監視 UI（Server Component）
  components/status/PodGrid.tsx           # Client Component（EventSource + useReducer）
  components/status/DeployVersions.tsx    # デプロイバージョン表示（Server Component）
  middleware.ts                           # /status と /api/status と /api/healthz をスキップ
```

FastAPI は変更なし。

---

## AWS 移行時の考慮

| 項目 | ローカル（k3s） | AWS（EKS） |
|---|---|---|
| ServiceAccount トークン | ファイルマウント自動 | IRSA / Pod Identity で同様に動作 |
| k8s API アドレス | `kubernetes.default.svc.cluster.local` | 同一（クラスター内部 DNS） |
| RBAC | ClusterRole/Binding | 同じ |
| SSE 長時間接続 | 問題なし | ALB のアイドルタイムアウト（600s）に注意 |
| `/status` の公開範囲 | VM ネットワーク内のみ | Security Group で IP 制限が現実的 |
| `deployments.db` | ホスト側ファイルシステム | S3 or RDS に移行を検討 |

---

## バージョン体系

```
v1.0    疎通確認完了
v1.1    運用安定化（レジストリ / toolbox / Fluent Bit）← 完了
v1.1.1  Pod 状態可視化（認証不要 / SSE / /status ページ）← ここ
v1.2    データフロー実装（Kafka / 名寄せ / スコアリング）
v1.3    監視・オブザーバビリティ（Prometheus / Grafana）
```
