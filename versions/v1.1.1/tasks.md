# v1.1.1 タスクリスト — Pod 状態可視化

作成日: 2026-03-17
参照: v1.1.1/plan.md

進捗凡例: `[ ]` 未着手 / `[>]` 作業中 / `[x]` 完了 / `[-]` スキップ

---

## フェーズ0: 現状確認

- [ ] **0-1. 既存の healthcheck を確認（重複チェック）**
  ```bash
  curl http://192.168.56.10:30800/ops/health | jq .
  ```
  - FastAPI `/ops/health` が返す構造を把握し、`/api/healthz` との棲み分けを確認
  - FastAPI 側: 各サービスへの疎通確認（アプリ目線）
  - Next.js 側: k8s API + Pod 状態（インフラ目線）→ 重複しない

- [ ] **0-2. frontend Pod 内の SA トークン確認**
  ```bash
  vagrant ssh -c "kubectl exec -n technomart deploy/frontend -- \
    ls /var/run/secrets/kubernetes.io/serviceaccount/"
  # → ca.crt  namespace  token
  ```

- [ ] **0-3. デフォルト SA の権限確認（Pod 一覧が取れないこと）**
  ```bash
  vagrant ssh -c "kubectl exec -n technomart deploy/frontend -- sh -c '
    TOKEN=\$(cat /var/run/secrets/kubernetes.io/serviceaccount/token)
    wget -qO- --no-check-certificate \
      --header=\"Authorization: Bearer \$TOKEN\" \
      https://kubernetes.default.svc.cluster.local/api/v1/namespaces/technomart/pods 2>&1 | head -5
  '"
  # → 403 Forbidden が返ること（RBAC 設定前）
  ```

- [ ] **0-4. versions/deployments.db のパスを frontend Pod から確認**
  ```bash
  vagrant ssh -c "kubectl exec -n technomart deploy/frontend -- \
    ls /technomart/versions/"
  # → deployments.db schema.sql record.sh status.sh rollback.sh
  ```
  - `/technomart` マウントが Pod 内に存在することを確認

### ✅ フェーズ0 完了基準
- [x] SA トークンが Pod 内にマウントされていること（ca.crt / namespace / token 確認）
- [x] RBAC 設定前は 403 が返ること（権限なしを確認）
- [x] `versions/deployments.db` の VM 上パスを確認（`/technomart/versions/deployments.db`）

**フェーズ0 結果メモ**:
- FastAPI `/ops/health` はアプリ疎通確認（PostgreSQL/ClickHouse/Kafka/Redis/Ollama）。auth 必須。`/api/healthz` との棲み分け OK。
- SA トークンファイルは自動マウント済み ✓
- デフォルト SA は 403 → Phase 1 の RBAC が必要 ✓
- `versions/` は Pod 内から **見えない**（hostPath Volume mount が未設定）→ Phase 1 のマニフェスト変更で対応

---

## フェーズ1: RBAC + マニフェスト変更

- [x] **1-1. `infrastructure/k8s/frontend/manifest.yaml` に RBAC を追加**
  - 追加リソース（manifest の先頭に追記）:
    ```yaml
    ServiceAccount: frontend-sa (namespace: technomart)
    ClusterRole: technomart-pod-reader
      pods: get, list, watch
      nodes: get, list
    ClusterRoleBinding: frontend-pod-reader
    ```
  - Deployment の `spec.template.spec` に `serviceAccountName: frontend-sa` を追加

- [x] **1-2. マニフェスト適用**
  ```bash
  vagrant ssh -c "kubectl apply -f /technomart/infrastructure/k8s/frontend/manifest.yaml"
  vagrant ssh -c "kubectl get serviceaccount frontend-sa -n technomart"
  vagrant ssh -c "kubectl get clusterrolebinding frontend-pod-reader"
  ```

- [x] **1-3. frontend Deployment を rollout restart して新しい SA を適用**
  ```bash
  vagrant ssh -c "kubectl rollout restart deployment/frontend -n technomart"
  vagrant ssh -c "kubectl rollout status deployment/frontend -n technomart"
  ```

### 🧪 テスト1: RBAC 疎通確認
```bash
# frontend Pod 内から Pod 一覧が取れること
vagrant ssh -c "kubectl exec -n technomart deploy/frontend -- sh -c '
  TOKEN=\$(cat /var/run/secrets/kubernetes.io/serviceaccount/token)
  wget -qO- --no-check-certificate \
    --header=\"Authorization: Bearer \$TOKEN\" \
    https://kubernetes.default.svc.cluster.local/api/v1/namespaces/technomart/pods \
    | head -c 300
'"
# → items: [...] の JSON が返ること
```
- [x] Pod 一覧の JSON が返ること（403 ではないこと）
- [x] `kube-system` namespace は取得できないこと（Role スコープで 403 確認）
**結果**: ✅ 合格（当初 ClusterRole で全 ns に効いていたため Role + RoleBinding に修正）

---

## フェーズ2: lib/k8s.ts + lib/versions.ts + 型定義

- [x] **2-1. `lib/types.ts` に型を追加**
  ```typescript
  export interface PodInfo {
    name: string;
    namespace: string;
    status: string;       // "Running" | "Pending" | "CrashLoopBackOff" etc.
    ready: string;        // "1/1"
    restarts: number;
    age: string;          // "2h" / "3d"
    image: string;        // イメージタグ（例: 192.168.56.10:32500/technomart-backend:v1.1-04b359d）
    message?: string;     // エラー時の詳細
  }

  export interface PodEvent {
    type: "ADDED" | "MODIFIED" | "DELETED";
    pod: PodInfo;
  }

  export interface ClusterHealth {
    nextjs: "ok";
    k8s_api: "ok" | "error";
    k8s_error?: string;
    pods: {
      running: number;
      pending: number;
      failed: number;
      unknown: number;
    };
  }

  export interface DeployRecord {
    environment: string;
    service: string;
    semver: string;
    git_hash: string;
    deployed_at: string;
  }
  ```

- [x] **2-2. `lib/k8s.ts` を作成**
  - `k8sFetch(path, init?)` — SA トークン付き fetch
  - `listPods(namespace)` — Pod 一覧を `PodInfo[]` で返す
  - `watchPods(namespace)` — AsyncGenerator で `PodEvent` を yield
  - `toPodInfo(raw)` — k8s raw オブジェクトから `PodInfo` に変換
  - TLS: `NODE_EXTRA_CA_CERTS` 環境変数で CA 証明書を指定（Dockerfile に追加）

- [x] **2-3. `lib/versions.ts` を作成**
  - `deployments.db` を child_process の `sqlite3` コマンドで読む（依存追加なし）
  - `getCurrentDeployments(): DeployRecord[]`

- [-] **2-4. `application/frontend/Dockerfile` に TLS 環境変数を追加**
  ```dockerfile
  ENV NODE_EXTRA_CA_CERTS=/var/run/secrets/kubernetes.io/serviceaccount/ca.crt
  ```
  - これで Node.js の fetch が k8s API の自己署名証明書を信頼する

### ✅ フェーズ2 完了基準
- [x] `lib/k8s.ts` の `listPods("technomart")` が Pod 一覧を返す（ローカルで動作確認）
- [x] `lib/versions.ts` が `deployments.db` から現在の状態を読める
**結果**: ✅ 実装完了（NODE_EXTRA_CA_CERTS は ConfigMap 経由で設定済みのため Dockerfile 変更不要）

---

## フェーズ3: API エンドポイント作成

- [x] **3-1. `app/api/healthz/route.ts` を作成**
  - 認証不要
  - L2: k8s API server へ疎通確認（`/healthz` エンドポイント）
  - L3: Pod 数サマリー（Running / Pending / Failed / Unknown）
  - エラーでも 200 を返す（`k8s_api: "error"` として通知）
  - `Cache-Control: no-store`

- [x] **3-2. `app/api/status/pods/stream/route.ts` を作成**
  - 認証不要
  - k8s watch API をパイプして SSE に変換
  - NDJSON の行バッファリング処理
  - `retry: 3000` ディレクティブで自動再接続設定
  - クライアント切断時（`req.signal.aborted`）に reader をキャンセル

- [x] **3-3. `middleware.ts` を更新**
  ```typescript
  pathname === "/api/healthz" ||
  pathname.startsWith("/api/status/") ||
  pathname.startsWith("/status")
  ```
  をスキップリストに追加

### 🧪 テスト3: API エンドポイント確認
```bash
# /api/healthz（認証なし）
curl http://192.168.56.10:30300/api/healthz | jq .
# 期待: { "nextjs":"ok", "k8s_api":"ok", "pods":{"running":11,...} }

# /api/status/pods/stream（認証なし・5秒間受信）
curl -N --max-time 5 http://192.168.56.10:30300/api/status/pods/stream
# 期待: data: {"type":"ADDED","pod":{"name":"backend-xxx",...}} が流れてくる

# /ops/pods/stream が存在しないこと（パス変更確認）
curl -s -o /dev/null -w "%{http_code}" \
  http://192.168.56.10:30300/api/ops/pods/stream
# → 404
```
- [ ] `/api/healthz` が認証なしで 200 を返すこと
- [ ] SSE ストリームで ADDED イベントが流れること（Pod 数 = 11）
- [ ] Pod を削除すると DELETED → ADDED イベントが流れること
**期待結果**: 全エンドポイントが認証なしで動作する
**実装完了**: フェーズ5（デプロイ）後に実機確認

---

## フェーズ4: フロントエンド UI

- [x] **4-1. `components/status/PodGrid.tsx` を作成（Client Component）**
  ```typescript
  "use client";
  ```
  - `useEffect` で `/api/status/pods/stream` に EventSource を接続
  - `useReducer` で Pod リストを管理
    - ADDED: リストに追加
    - MODIFIED: 既存エントリを更新
    - DELETED: リストから削除
  - Pod カード: 名前 / ステータスバッジ（色分け） / READY / RESTART 数 / AGE / イメージタグ（末尾のタグ部分のみ）
  - ステータス色分け:
    - Running → `default`（緑）
    - Pending / ContainerCreating → `secondary`（黄）
    - CrashLoopBackOff / Error / OOMKilled → `destructive`（赤）
    - Unknown / Terminating → `outline`（グレー）
  - 右上に接続状態インジケーター（● Connected / ○ Reconnecting...）
  - コンポーネントアンマウント時に `EventSource.close()` を呼ぶ

- [x] **4-2. `components/status/DeployVersions.tsx` を作成（Server Component）**
  - `lib/versions.ts` から現在のデプロイ状態を取得
  - テーブル形式で表示: 環境 / サービス / バージョン / git hash / デプロイ日時
  - `deployments.db` が存在しない場合は「記録なし」を表示

- [x] **4-3. `app/status/page.tsx` を作成（Server Component）**
  - `export const dynamic = "force-dynamic"`
  - ページ上部: クラスター概要（初期 snapshot の Pod 数）
  - 中段: `<DeployVersions />` — デプロイバージョン一覧
  - 下段: `<PodGrid />` — リアルタイム Pod グリッド

### 🧪 テスト4: UI 動作確認
```
ブラウザで http://192.168.56.10:30300/status を開く（ログインせずに）
```
- [ ] ログイン画面にリダイレクトされないこと
- [ ] デプロイバージョンが表示されること（prod/backend: v1.1-04b359d 等）
- [ ] Pod グリッドが表示されること（全 11 Pod）
- [ ] ステータスが色分けされていること
- [ ] 別ターミナルで Pod を削除すると、ブラウザのグリッドが自動更新されること
  ```bash
  kubectl delete pod -l app=redis -n technomart
  # → Redis の Pod カードが消えて、新しい Pod が現れること
  ```
- [ ] 接続状態インジケーターが表示されていること
**期待結果**: 認証不要でリアルタイム Pod 監視が動作する

---

## フェーズ5: デプロイ + 最終確認

- [x] **5-1. frontend イメージをビルドして push**
  ```bash
  vagrant ssh
  REGISTRY="192.168.56.10:32500"
  SEMVER=$(cat /technomart/VERSION | tr -d '[:space:]')
  GIT_HASH=$(git -C /technomart rev-parse --short HEAD)
  TAG="${SEMVER}-${GIT_HASH}"

  docker build \
    -t "${REGISTRY}/technomart-frontend:${TAG}" \
    -t "${REGISTRY}/technomart-frontend:latest" \
    /technomart/application/frontend

  docker push "${REGISTRY}/technomart-frontend:${TAG}"
  docker push "${REGISTRY}/technomart-frontend:latest"

  kubectl set image deployment/frontend \
    frontend="${REGISTRY}/technomart-frontend:${TAG}" \
    -n technomart
  kubectl rollout status deployment/frontend -n technomart
  ```

- [x] **5-2. デプロイ記録**
  ```bash
  bash /technomart/versions/record.sh prod frontend "$SEMVER" "$GIT_HASH" \
    "${REGISTRY}/technomart-frontend:${TAG}" "v1.1.1 pod monitoring"
  ```

### 🧪 テスト5: エンドツーエンド確認
```
[x] http://192.168.56.10:30300/api/healthz が認証なしで 200 を返す
[x] http://192.168.56.10:30300/status がログインなしで開ける（HTTP 200）
[x] デプロイバージョンに prod/frontend の新しい記録が表示される
[x] Pod グリッドがリアルタイムで更新される（SSE ストリーム確認済み）
[ ] vagrant reload 後も /status が正常に動作する（未確認）
[x] /ops/* は引き続き認証が必要なこと（/ops/overview → 307 リダイレクト確認）
```
**期待結果**: v1.1 の全機能 + 認証不要の Pod 監視ページが安定稼働
**実機確認日**: 2026-03-17 — /api/healthz: {nextjs:ok, k8s_api:ok, pods:{running:10,pending:1,failed:0}}

---

## 作業メモ欄

### フェーズ0
- 実施日:
- `versions/deployments.db` の Pod 内からのパス:

### フェーズ1
- 実施日:
- RBAC 適用後の動作確認:

### フェーズ2
- 実施日:
- TLS 対応の方針（NODE_EXTRA_CA_CERTS vs NODE_TLS_REJECT_UNAUTHORIZED）:

### フェーズ3
- 実施日:
- SSE watch 切断時の再接続動作:

### フェーズ4
- 実施日:
- EventSource vs fetch stream の選択理由:

### フェーズ5
- 実施日:
- デプロイ後の動作確認:

---

## ✅ v1.1.1 完了基準

| 確認項目 | 確認方法 |
|---|---|
| `/api/healthz` が認証不要で動作 | `curl http://192.168.56.10:30300/api/healthz` |
| `/status` がログインなしで開ける | ブラウザで直接アクセス |
| デプロイバージョンが表示される | versions/deployments.db の内容と一致 |
| Pod グリッドがリアルタイム更新 | Pod 削除 → ブラウザで即時反映 |
| `/ops/*` は依然として認証必須 | 未ログイン状態で `/ops/overview` → ログイン画面へ |
| FastAPI に変更がない | `git diff application/backend` で確認 |
