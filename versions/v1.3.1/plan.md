# v1.3.1 アップデート計画 — ログ集約（Loki）+ メモリ要件の最終計測・Vagrantfile 更新

作成日: 2026-03-20（草案）
前提: v1.3（監視・オブザーバビリティ）完了後に着手

---

## 作業ルール

**バージョンアップ作業を開始する前に必ずスナップショットを保存する。**

```bash
cd infrastructure/vagrant/production
vagrant snapshot save "pre-v1.3.1"
```

---

## 目的

2つのゴールを持つ。

1. **Grafana Loki の導入** — Fluent Bit（v1.1 で導入済み）のログ出力先を Loki に追加し、
   Grafana からメトリクス・ログを一元的に参照できる状態にする。
   ELK（Elasticsearch + Logstash + Kibana）と比較して RAM 消費が約 1/40 であり、
   このプロジェクトの規模に適した選択肢。

2. **最終ピーク RAM 計測 → Vagrantfile 更新** — v1.2.1 のベースラインに対し、
   v1.3 監視スタック + Loki 込みの最終 RAM を計測し、`vb.memory` を適切な値に更新する。

### 2段階計測の全体像（RAM 計測）

| フェーズ | バージョン | 内容 |
|---|---|---|
| フェーズ1 | v1.2.1 | 監視スタックなし状態のベースライン記録 |
| **フェーズ2（本 plan）** | **v1.3.1** | 監視スタック込みの最終ピーク計測 → Vagrantfile 更新 |

### 追加 RAM 見込み（v1.3 + v1.3.1）

| コンポーネント | 追加 RAM 見込み | 備考 |
|---|---|---|
| Prometheus（保存期間 15d / PVC 20Gi） | ~1GB | v1.3 |
| Grafana | ~256MB | v1.3 |
| Alertmanager + Pushgateway | ~256MB | v1.3 |
| Exporter 群（6種） | ~512MB | v1.3 |
| **Loki** | **~100MB** | v1.3.1 |
| **合計** | **~2.1GB** | ELK なら ~4–6GB |

---

## Loki — ログ集約スタック

### 設計方針

```
Fluent Bit（DaemonSet・v1.1 導入済み）
  └─ output: loki プラグイン（追加設定のみ）
        ↓
Loki（monitoring namespace）
        ↓
Grafana（v1.3 導入済み・Loki を DataSource として追加）
```

ELK との比較で選定した理由：

| 観点 | ELK | Loki |
|---|---|---|
| RAM | ~4–6GB（JVM） | ~100MB |
| インデックス方式 | 全文検索インデックス | ラベルベース（PromQL と同思想） |
| Grafana 統合 | 追加設定が必要 | ネイティブ DataSource |
| Fluent Bit 連携 | Logstash or Beats | `fluent-bit-loki` プラグイン |
| AWS 対応 | Amazon OpenSearch | CloudWatch Logs / Managed Grafana |

### ログラベル設計

Loki はラベルでログを分類する。このプロジェクトでは以下のラベルを付与する。

```
namespace   = default / monitoring
app         = backend / frontend / kafka / postgresql / clickhouse / redis / ollama
level       = info / warning / error
```

structlog（FastAPI）の JSON ログはそのまま Loki に取り込み、
Grafana の LogQL でフィルタリングする。

### k8s リソース構成

```
namespace: monitoring

Deployment:
  loki    50m CPU / 256Mi RAM（実測は ~100MB）
  PVC:    10Gi（ログチャンク保存）
```

### AWS 移行時の対応

| ローカル | AWS | 移行コスト |
|---|---|---|
| Loki | Amazon CloudWatch Logs | Fluent Bit の output を `cloudwatch_logs` に変更するだけ |
| Grafana | Amazon Managed Grafana | Loki DataSource → CloudWatch DataSource に差し替え |

---

## Loki 実装手順

### Step 1: Loki マニフェスト作成・適用

`infrastructure/k8s/monitoring/loki/manifest.yaml` を作成。

```yaml
# 構成要素
- ConfigMap: loki-config（保存期間・チャンクサイズ等）
- PVC: loki-data（10Gi）
- Deployment: loki
- Service: loki（ClusterIP、ポート 3100）
```

主な設定値：

```yaml
# loki-config.yaml（抜粋）
auth_enabled: false
storage:
  type: filesystem          # ローカル。AWS移行時は s3 に変更
limits_config:
  retention_period: 168h    # 7日（Prometheus の 15日より短くていい）
```

### Step 2: Fluent Bit の出力先に Loki を追加

v1.1 で導入済みの Fluent Bit ConfigMap に Loki output を追加する。
既存の出力（stdout 等）は残したまま追記する形で変更最小に保つ。

```ini
[OUTPUT]
    Name        loki
    Match       *
    Host        loki.monitoring.svc.cluster.local
    Port        3100
    Labels      job=fluent-bit, namespace=$kubernetes['namespace_name'], app=$kubernetes['labels']['app']
    Auto_Kubernetes_Labels on
```

### Step 3: Grafana に Loki DataSource を追加

v1.3 で作成した Grafana のプロビジョニング設定に追記。

```yaml
# grafana/provisioning/datasources/loki.yaml
apiVersion: 1
datasources:
  - name: Loki
    type: loki
    url: http://loki.monitoring.svc.cluster.local:3100
    isDefault: false
```

### Step 4: Grafana でログ確認

```
Grafana → Explore → DataSource: Loki
LogQL: {namespace="default", app="backend"} |= "ERROR"
```

確認ポイント：
- FastAPI の structlog JSON ログが取り込まれていること
- `level="error"` のフィルタが動作すること
- Prometheus のメトリクスと時刻軸を合わせてログを参照できること（Grafana の "Correlate" 機能）

### Step 5: Grafana にログダッシュボードを追加

`infrastructure/k8s/monitoring/grafana/dashboards/logs.json` を作成。

| パネル | LogQL |
|---|---|
| エラーログ一覧（直近 1h） | `{namespace="default"} \|= "error"` |
| サービス別ログ量推移 | `sum by (app) (rate({namespace="default"}[5m]))` |
| バッチジョブ完了ログ | `{app="backend"} \|= "job_completed"` |

---

## 計測シナリオ

v1.2.1 と同一シナリオで計測し、差分（監視スタック由来の増加分）を明確にする。

### シナリオ A: アイドル状態（ベースライン）

全サービス起動済み（monitoring namespace 含む）。バッチ未実行。

```bash
vagrant ssh -c "
  echo '=== Node ===' && kubectl top nodes
  echo '=== default Pods ===' && kubectl top pods -n default --sort-by=memory
  echo '=== monitoring Pods ===' && kubectl top pods -n monitoring --sort-by=memory
  echo '=== Host ===' && free -h
"
```

### シナリオ B: API 並列リクエスト（10 並列）

```bash
for i in $(seq 1 10); do
  curl -s http://192.168.56.10:30300/api/healthz &
done
wait
vagrant ssh -c "kubectl top pods -n default --sort-by=memory"
```

### シナリオ C: ClickHouse 分析クエリ

```bash
vagrant ssh -c "
  kubectl exec -n default deploy/clickhouse -- \
    clickhouse-client --query '
      SELECT toStartOfMonth(event_time) AS month, category, count() AS cnt, sum(amount) AS total
      FROM events WHERE event_time >= today() - 365
      GROUP BY month, category ORDER BY month, total DESC
    '
  kubectl top pods -n default -l app=clickhouse
"
```

### シナリオ D: Ollama 推論（1 / 3 / 5 並列）

```bash
# 1 並列
vagrant ssh -c "kubectl exec -n default deploy/ollama -- ollama run qwen2.5:3b '顧客セグメント分析の結果を要約して'"

# 3 並列
for i in 1 2 3; do
  vagrant ssh -c "kubectl exec -n default deploy/ollama -- ollama run qwen2.5:3b 'テスト ${i}'" &
done
wait
vagrant ssh -c "kubectl top pods -n default -l app=ollama"
```

### シナリオ E: スコアリングバッチ実行

```bash
vagrant ssh -c "
  kubectl create job --from=cronjob/scoring-batch scoring-batch-manual-$(date +%s) -n default
  sleep 30
  kubectl top pods -n default --sort-by=memory && kubectl top nodes
"
```

### シナリオ F: pgvector 類似検索（Embedding）

```bash
vagrant ssh -c "
  kubectl top pods -n default -l app=backend
  kubectl top pods -n default -l app=ollama
  kubectl top pods -n default -l app=postgresql
"
```

### シナリオ G: 全シナリオ同時（ピーク推定）

B + C + D（3並列）+ E を同時実行してピーク RAM を計測。

---

## 計測手順

### ステップ 1: 計測ツールの確認

```bash
vagrant ssh -c "
  kubectl top nodes
  kubectl top pods -n default
  kubectl top pods -n monitoring
"
```

### ステップ 2: 各シナリオ実行 → 計測

各シナリオ実行中・実行直後に以下を繰り返す:

```bash
vagrant ssh -c "
  kubectl top nodes
  kubectl top pods -n default --sort-by=memory
  kubectl top pods -n monitoring --sort-by=memory
  free -h
"
```

### ステップ 3: 結果を results.md に記録

`versions/v1.3.1/results.md` に下記テンプレートで記録する。

---

## 結果記録テンプレート

```markdown
# v1.3.1 メモリ計測結果

計測日: YYYY-MM-DD

## 環境
- VM RAM: 48GB allocated
- k3s version: X.X.X
- Ollama models: qwen2.5:3b, nomic-embed-text
- 監視スタック: Prometheus / Grafana / Alertmanager / Pushgateway / 各 Exporter / Loki

## シナリオ別ピーク RAM（VM ホスト視点）

| シナリオ | Used (free -h) | Available | v1.2.1 比 増分 |
|---|---|---|---|
| A: アイドル | X.XGB | X.XGB | +X.XGB |
| B: API 10並列 | | | |
| C: ClickHouse クエリ | | | |
| D: Ollama 1並列 | | | |
| D: Ollama 3並列 | | | |
| E: スコアリングバッチ | | | |
| F: pgvector 検索 | | | |
| G: 全同時（ピーク） | | | |

## Pod 別ピーク RAM（monitoring namespace）

| Pod | アイドル | ピーク |
|---|---|---|
| prometheus | | |
| grafana | | |
| alertmanager | | |
| pushgateway | | |
| kafka-exporter | | |
| postgres-exporter | | |
| clickhouse-exporter | | |
| redis-exporter | | |
| kube-state-metrics | | |
| node-exporter | | |
| loki | | |

## 推奨 RAM 値（最終決定）

| 構成 | RAM | 根拠 |
|---|---|---|
| 最小動作（アイドルのみ） | X GB | ピークアイドル × 1.5 |
| 開発推奨（並列 API + バッチ） | X GB | ピーク G × 1.3 |
| 余裕あり（全負荷 + Docker ビルド） | X GB | ピーク G + Docker 2GB × 1.3 |
```

---

## Vagrantfile 更新手順

計測結果を元に `vb.memory` を更新する。

```ruby
# infrastructure/vagrant/production/Vagrantfile
config.vm.provider "virtualbox" do |vb|
  vb.memory = "XXXX"   # results.md の「開発推奨」値（MB単位）
  vb.cpus   = 10
end
```

変更後:

```bash
cd infrastructure/vagrant/production
vagrant reload
# 起動確認
kubectl get pods -n default
kubectl get pods -n monitoring
vagrant snapshot save "v1.3.1-stable"
```

---

## 判断基準

| 計測ピーク（全負荷） | 推奨 `vb.memory` | 対象 PC |
|---|---|---|
| ～ 8GB | `12288` (12GB) | ミドルレンジ PC (16GB RAM) |
| ～ 12GB | `16384` (16GB) | ハイエンド PC (32GB RAM) |
| ～ 20GB | `24576` (24GB) | ワークステーション (32GB+) |
| 20GB 超 | スタック縮小を検討 | Ollama をオフロード等 |

### スタック縮小オプション（RAM 不足時）

1. **Ollama を外部 API に切り替え**: 最大 3–4GB 削減。抽象化レイヤー経由なので変更最小。
2. **ClickHouse のメモリ上限を制限**: `max_memory_usage` を設定（デフォルト無制限）
3. **Kafka のヒープを削減**: `KAFKA_HEAP_OPTS=-Xmx256m` 等
4. **Prometheus の保存期間を短縮**: `--storage.tsdb.retention.time=7d`

---

## 完了基準

### Loki

| 確認項目 | 確認方法 |
|---|---|
| Loki Pod が Running であること | `kubectl get pods -n monitoring -l app=loki` |
| Fluent Bit がログを Loki に送信していること | Loki の `/ready` エンドポイントが OK |
| Grafana で Loki DataSource が認識されていること | Grafana → Configuration → Data Sources |
| LogQL `{namespace="default"}` でログが返ること | Grafana → Explore → Loki |
| エラーログフィルタが動作すること | `{namespace="default"} \|= "error"` |
| ログダッシュボードが表示されること | Grafana ダッシュボード一覧 |

### RAM 計測・Vagrantfile

| 確認項目 | 確認方法 |
|---|---|
| 全シナリオの計測値が記録されていること | `versions/v1.3.1/results.md` に数値あり |
| v1.2.1 との差分（監視スタック + Loki 増加分）が記録されていること | results.md の「v1.2.1 比 増分」列 |
| 推奨 RAM 値が決定されていること | results.md の「推奨 RAM 値」セクション |
| Vagrantfile が更新されていること | `git diff infrastructure/vagrant/production/Vagrantfile` |
| `vagrant reload` 後に全 Pod が正常起動すること | `kubectl get pods -n default && kubectl get pods -n monitoring` |
| v1.3.1-stable スナップショットが保存されていること | `vagrant snapshot list` |
