# v1.3.1 仕様書 — Loki ログ集約 + 認証バグ修正

作成日: 2026-03-21
前提: v1.3（監視・オブザーバビリティ）完了後に着手

---

## 概要

v1.3.1 では以下の 2 つのテーマを扱う。

| テーマ | 内容 |
|---|---|
| **Loki ログ集約** | Fluent Bit → Loki → Grafana によるログ一元参照 |
| **認証バグ修正** | SessionGuard クロスタブ検知・ログイン済みエラー表示の 2 件 |

---

## Part 1: Loki ログ集約スタック

### 設計方針

```
Fluent Bit（DaemonSet・v1.1 導入済み）
  └─ output: loki プラグイン（追加設定のみ）
        ↓
Loki（monitoring namespace・ClusterIP:3100）
        ↓
Grafana（v1.3 導入済み・Loki を DataSource として追加）
```

ELK との比較で Loki を選定した理由：

| 観点 | ELK | Loki |
|---|---|---|
| RAM | ~4–6 GB（JVM） | **~100 MB** |
| インデックス方式 | 全文検索インデックス | ラベルベース（PromQL と同思想） |
| Grafana 統合 | 追加設定が必要 | ネイティブ DataSource |
| Fluent Bit 連携 | Logstash or Beats | `fluent-bit-loki` プラグイン（設定追記のみ） |
| AWS 移行時 | Amazon OpenSearch | CloudWatch Logs（Fluent Bit の output 変更のみ） |

### k8s リソース構成

```
namespace: monitoring

Deployment: loki
  - image: grafana/loki:2.9.2
  - resources: 50m CPU / 256Mi RAM（実測 ~58 Mi）
  - PVC: loki-data（10 Gi、ローカル filesystem ストレージ）
  - Service: ClusterIP port 3100

ConfigMap: loki-config
  auth_enabled: false
  storage.type: filesystem         # AWS移行時は s3 に変更
  limits_config.retention_period: 168h  # 7日
```

### Fluent Bit 設定（追記分）

```ini
[OUTPUT]
    Name        loki
    Match       kube.*
    Host        loki.monitoring.svc.cluster.local
    Port        3100
    Labels      job=fluent-bit
    Auto_Kubernetes_Labels on
```

既存の stdout 出力はそのまま残す（設定追記のみ）。

### ログラベル設計

| ラベル | 値の例 |
|---|---|
| `namespace` | `technomart` / `monitoring` |
| `app` | `backend` / `frontend` / `kafka` / ... |
| `job` | `fluent-bit` |

FastAPI（structlog）の JSON ログはそのまま取り込み、
Grafana の LogQL でフィルタリングする。

### Grafana Loki DataSource 設定

```yaml
# grafana/provisioning/datasources に追記
- name: Loki
  type: loki
  url: http://loki.monitoring.svc.cluster.local:3100
  isDefault: false
```

### ログダッシュボード（07-logs）

| パネル | LogQL |
|---|---|
| エラーログ一覧（直近 1h） | `{namespace="technomart"} \|= "error"` |
| サービス別ログ量推移 | `sum by (app) (rate({namespace="technomart"}[5m]))` |
| バッチジョブ完了ログ | `{namespace="technomart", app="backend"} \|= "job_completed"` |

### 動作確認コマンド

```bash
# Loki Pod 状態
kubectl get pods -n monitoring -l app=loki

# Ready 確認
vagrant ssh -- "curl -s http://<LOKI_IP>:3100/ready"
# → "ready"

# Fluent Bit ログ（エラー確認）
kubectl logs -n technomart daemonset/fluent-bit --tail=30

# Grafana DataSource テスト
# http://192.168.56.10:30030 → Configuration → Data Sources → Loki → Save & Test
# → "Data source connected and labels found."
```

### AWS 移行時の対応

| ローカル | AWS | 移行コスト |
|---|---|---|
| Loki | Amazon CloudWatch Logs | Fluent Bit の output を `cloudwatch_logs` に変更するだけ |
| Grafana | Amazon Managed Grafana | Loki DataSource → CloudWatch DataSource に差し替え |

---

## Part 2: RAM 計測結果

### 計測環境

- VM RAM: 48 GB（vb.memory = 49152）
- VM CPU: 10 コア
- k3s version: v1.31.x
- 監視スタック: Prometheus / Grafana / Alertmanager / Pushgateway / 各 Exporter (6種) / Loki

### シナリオ別計測結果

| シナリオ | Node Used | Host Used | Host Available | 備考 |
|---|---|---|---|---|
| A: アイドル | 4,151 Mi | 4.1 GB | 42 GB | 全サービス起動済み・バッチ未実行 |
| B: API 10 並列 | 4,184 Mi | 4.2 GB | 42 GB | backend へ HTTP 10 並列 |
| C: ClickHouse クエリ | 4,189 Mi | 4.2 GB | 42 GB | pos_transactions 月次集計（10年分） |
| D: Ollama 1 並列 | 6,281 Mi | 6.3 GB | 40 GB | qwen2.5:3b 推論 |
| D: Ollama 3 並列 | 6,432 Mi | 6.3 GB | 40 GB | モデル共有のため差分小 |
| E: スコアリングバッチ | 6,334 Mi | 6.3 GB | 40 GB | scoring-daily 手動実行 |
| G: 全同時ピーク | 6,330 Mi | 6.3 GB | 40 GB | B+C+D(3並列)+E 同時 |

**ピーク: ~6.4 GB**（Ollama モデルロード直後が支配的）

### 監視スタック単体の増分（v1.2.1 比）

| コンポーネント | 増分 RAM |
|---|---|
| Prometheus | ~72 Mi |
| Grafana | ~62 Mi |
| Loki | ~58 Mi |
| Alertmanager + Pushgateway | ~31 Mi |
| Exporter 群 (6種) | ~106 Mi |
| **合計** | **~329 Mi（~0.3 GB）** |

計画見積もり（~2.1 GB）より大幅に少ない。JVM 不使用の軽量スタックのため。

### 推奨 vb.memory 値

| 構成 | RAM | 根拠 |
|---|---|---|
| 最小動作 | 8 GB | アイドル 4.1 GB × 2.0 |
| **開発推奨** | **16 GB** | ピーク 6.4 GB × 2.5（Ollama 込み） |
| 余裕あり | 24 GB | ピーク 6.4 GB + Docker 2 GB × 2.5 |

現在の 48 GB は過剰。16 GB に削減可能だが、ホスト RAM 128 GB のため現状維持。

### ディスク状況（注意）

| タイミング | 使用率 | 備考 |
|---|---|---|
| v1.3.1 作業開始時 | 59% (17 GB / 31 GB) | |
| Loki デプロイ後 | **94%** (27 GB / 31 GB) | Loki イメージ (~1.5 GB) + PVC で急増 |

> ⚠️ ディスク逼迫に注意。Vagrant 共有フォルダ (`/technomart`, `/vagrant`) が
> Windows C ドライブをマウントしており、k3s が DiskPressure と誤判定するケースあり。
> `/` のみ監視すれば十分（共有フォルダは計測対象外）。

---

## Part 3: 認証バグ修正

### Bug 1 — SessionGuard: クロスタブ セッション置き換え検知が機能しない

#### 症状

- Tab A で engineer ログイン中
- Tab B で別ユーザーがログインしても Tab A に何も起きない
- Tab A をリロードすると別ユーザーの権限で動作してしまう（意図しないセッション切り替え）

#### 根本原因

`redirectToLogin` が `router.push("/auth/login")` を呼んでいたが、
その時点でブラウザには別ユーザー（admin）の有効なセッションクッキーが残っている。
ミドルウェアが認証済みユーザーを `/auth/login` から `/ops/overview` へリダイレクトし、
結果として Tab A が元の画面に戻ってしまっていた。

#### 修正内容

**`components/auth/SessionGuard.tsx`**

```tsx
function redirectToLogin(username: string, router: ReturnType<typeof useRouter>) {
  sessionStorage.removeItem(SESSION_USER_ID_KEY);
  sessionStorage.removeItem(SESSION_USERNAME_KEY);
  toast.warning(`別のアカウント（${username}）でログインされたため、サインアウトしました。`, { duration: 3000 });

  // 先にサインアウト（クッキーを無効化）してから /auth/login に遷移
  // ※ サインアウト前に router.push すると、ミドルウェアが有効なクッキーを見て
  //   /ops/overview にリダイレクトしてしまうため、順序が重要
  fetch("/api/auth/signout", { method: "POST" }).finally(() => {
    setTimeout(() => {
      router.push(`/auth/login?reason=session_replaced&by=${encodeURIComponent(username)}`);
    }, 500);
  });
}
```

**15 秒ポーリングの追加（フォールバック）**

BroadcastChannel のハンドラが消えている場合（Tab A が `/auth/login` に遷移してから
別タブで admin ログインした場合など）のためのフォールバックとして、
15 秒間隔のポーリングを追加。

```tsx
const POLL_INTERVAL = 15_000;
const pollInterval = setInterval(async () => {
  if (redirectingRef.current) return;
  const me = await fetchMe();
  if (!me) { redirectingRef.current = true; router.push("/auth/login"); return; }
  const storedUserId = sessionStorage.getItem(SESSION_USER_ID_KEY);
  if (storedUserId && String(me.userId) !== storedUserId) {
    redirectingRef.current = true;
    redirectToLogin(me.username, router);
  }
}, POLL_INTERVAL);
```

#### 検知メカニズム（3 層構造）

| 層 | 仕組み | タイミング |
|---|---|---|
| BroadcastChannel | ログイン時に他タブへ即時通知 | 即座（ミリ秒） |
| visibilitychange | タブがフォーカスを得た瞬間に `/api/auth/me` を叩く | タブ切り替え時 |
| ポーリング | 15 秒ごとに `/api/auth/me` を確認 | 最大 15 秒後 |

#### sessionStorage の役割

`sessionStorage` はタブ固有（タブを閉じるまで保持）。
ログイン時に `userId` を保存し、現在のクッキーの userId と比較することで
「別ユーザーに上書きされた」を検知する。

---

### Bug 2 — ログイン済みで再ログイン試行すると「ネットワークエラーが発生しました」

#### 症状

- Tab A で engineer ログイン中
- Tab B などで同じブラウザからログインフォームを送信すると
  「既に〇〇としてログインされています」ではなく「ネットワークエラーが発生しました」が表示される

#### 根本原因

ミドルウェアが `/api/auth/signin`（POST）に対して
ログイン済みユーザーを **HTML リダイレクト（307）** で返していた。

`login/page.tsx` のフォーム送信処理では：
```tsx
const res = await fetch("/api/auth/signin", { method: "POST", ... });
const data = await res.json();  // ← HTML を JSON パースしようとして例外
```
`res.json()` が HTML ページを受け取ってパース失敗 → catch ブロック → 「ネットワークエラー」

#### 修正内容

**`middleware.ts`**

`/auth/login` と `/api/auth/signin` を別々のブロックに分離。

```typescript
// /auth/login（GET）: ログイン済みユーザーはホームへリダイレクト（従来通り）
if (pathname.startsWith("/auth/login")) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    const user = await authProvider.verifyToken(token);
    if (user) {
      const homeUrl = req.nextUrl.clone();
      homeUrl.pathname = ROLE_HOME[user.role];
      homeUrl.search = "";
      return NextResponse.redirect(homeUrl);
    }
  }
  return NextResponse.next();
}

// /api/auth/signin（POST）: ログイン済みユーザーには JSON エラーを返す
// redirect だと fetch() が HTML を受け取り res.json() が失敗する
if (pathname.startsWith("/api/auth/signin")) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    const user = await authProvider.verifyToken(token);
    if (user) {
      return NextResponse.json(
        { error: `既に ${user.username} としてログインされています。別のアカウントでログインするには、先にサインアウトしてください。` },
        { status: 409 }
      );
    }
  }
  return NextResponse.next();
}
```

#### フォーム側のエラーハンドリング（変更なし・既存で正しい）

`login/page.tsx` は `res.ok` チェック前に `res.json()` を呼んでいるため、
409 レスポンスが正しく JSON を返すようになった時点で自動的に動作する。

```tsx
const data = await res.json();       // 409 JSON を正常に受け取れる
if (!res.ok) {
  setServerError(data.error ?? "ログインに失敗しました");  // "既に engineer として..."
  return;
}
```

---

### デプロイ時の落とし穴: image タグのピン留め問題

#### 症状

ソースコードを修正して Docker ビルド・push・`kubectl rollout restart` を実行しても、
Pod が古いコードで動き続ける。

#### 根本原因

Deployment の `image` フィールドが `latest` ではなく特定タグ（`v1.1-c069cae`）に
ピン留めされていた。`rollout restart` は既存の `image` 指定をそのまま使うため、
新しいイメージは参照されない。

```bash
# NG: ビルド + push + restart だけでは更新されない
kubectl rollout restart deployment/frontend -n technomart

# OK: set image で latest に更新してから restart
kubectl set image deployment/frontend frontend=192.168.56.10:32500/technomart-frontend:latest -n technomart
kubectl rollout restart deployment/frontend -n technomart
```

#### `/deploy` スキルへの反映

`/deploy` スキル（`.claude/commands/deploy.md`）の Step 4 に
`kubectl set image` を rollout restart の前に実行するよう追記。

---

## Playwright E2E テスト

### session-guard.spec.ts

`tests/e2e/session-guard.spec.ts` — SessionGuard の動作を検証。

| テスト | 内容 |
|---|---|
| 前提確認: engineer ログイン後の sessionStorage・/api/auth/me | sessionStorage に userId が保存されること |
| 前提確認: admin の userId が engineer と異なること | userId が異なること（検知の前提） |
| Tab A (engineer) → signout → Tab B (admin) → Tab A フォーカスで /auth/login | visibilitychange による検知 ✅ |
| BroadcastChannel: Tab B admin ログイン → Tab A 即リダイレクト | BC による即時検知 ✅ |
| /auth/login の session_replaced バナー表示 | `?reason=session_replaced&by=admin` でバナー表示 ✅ |

### already-authenticated.spec.ts

`tests/e2e/already-authenticated.spec.ts` — ログイン済み状態での再ログイン試行を検証。

| テスト | 内容 |
|---|---|
| API 直接確認: /api/auth/signin が 409 JSON を返すこと | ステータス 409・Content-Type: application/json ✅ |
| UI 確認: page.evaluate で fetch → エラーフィールド確認 | `data.error` に「既に engineer として...」が含まれること ✅ |
| 実フォーム確認: ミドルウェアのリダイレクト挙動 | ログイン済みで /auth/login → /ops/overview にリダイレクト（想定通り）✅ |

---

## 完了状態

| 項目 | 状態 |
|---|---|
| Loki Pod Running | ✅ |
| Fluent Bit → Loki ログ転送 | ✅ |
| Grafana Loki DataSource | ✅ |
| ログダッシュボード (07-logs) | ✅ |
| RAM 計測・results.md 記録 | ✅ |
| Vagrantfile コメント更新 | ✅ |
| SessionGuard クロスタブ検知 | ✅ |
| ログイン済みエラーメッセージ (409 JSON) | ✅ |
| Playwright E2E テスト全件パス | ✅ |
| v1.3.1-stable スナップショット | ✅ |
