# v1.3 タスクリスト — 監視・オブザーバビリティ

作成日: 2026-03-20
参照: versions/v1.3/plan.md
前提: v1.2g（CI/CD基盤整備）完了後に着手

進捗凡例: `[ ]` 未着手 / `[>]` 作業中 / `[x]` 完了 / `[-]` スキップ

---

## フェーズ-1: 作業前スナップショット（必須）

- [ ] **-1-1. 現在のスナップショット一覧を確認**
  ```bash
  cd infrastructure/vagrant/production
  vagrant snapshot list
  # → v1.2g-stable が存在すること
  ```

- [ ] **-1-2. 作業前スナップショットを保存**
  ```bash
  vagrant snapshot save "pre-v1.3"
  vagrant snapshot list
  ```

### ✅ フェーズ-1 完了基準
- [ ] `pre-v1.3` がスナップショット一覧に表示されること

---

## フェーズ1: monitoring namespace + Prometheus + node_exporter

> 監視スタックの土台。メトリクス収集基盤を最初に確立する。

- [ ] **1-1. monitoring namespace 作成**
  ```bash
  kubectl create namespace monitoring
  ```

- [ ] **1-2. Prometheus マニフェスト作成・適用**
  - `infrastructure/k8s/monitoring/prometheus/manifest.yaml`
  - 200m CPU / 1Gi RAM / PVC 20Gi
  - 保存期間: `--storage.tsdb.retention.time=15d`
  - ServiceMonitor の代わりに `prometheus.yml` の `static_configs` で開始（シンプル優先）

- [ ] **1-3. node_exporter DaemonSet 作成・適用**
  - `infrastructure/k8s/monitoring/node-exporter/manifest.yaml`
  - hostNetwork: true / hostPID: true で VM の実メトリクスを取得

- [ ] **1-4. Prometheus から node_exporter のメトリクスが取得できることを確認**
  ```bash
  # Port-forward して curl で確認
  kubectl port-forward -n monitoring svc/prometheus 9090:9090
  # ブラウザ or curl: http://localhost:9090/targets → node-exporter が UP
  ```

### ✅ フェーズ1 完了基準
- [ ] `kubectl get pods -n monitoring` で prometheus / node-exporter が Running
- [ ] Prometheus UI の Targets 画面で node-exporter が `State: UP`
- [ ] `node_cpu_seconds_total` クエリが結果を返すこと

---

## フェーズ2: kube-state-metrics

> Pod死活・Deployment状態・PVC使用率の基本監視を追加。

- [ ] **2-1. kube-state-metrics マニフェスト作成・適用**
  - `infrastructure/k8s/monitoring/kube-state-metrics/manifest.yaml`
  - ClusterRole + ClusterRoleBinding が必要

- [ ] **2-2. Prometheus scrape 設定に追加**
  - prometheus.yml の `scrape_configs` に `kube-state-metrics` ジョブを追加

- [ ] **2-3. 動作確認**
  - `kube_pod_status_phase` / `kube_deployment_status_replicas_available` が取得できること

### ✅ フェーズ2 完了基準
- [ ] Prometheus UI で `kube_pod_status_phase{namespace="default"}` が全 Pod 分返ること
- [ ] `kube_deployment_status_replicas_available` で全 Deployment の状態が確認できること

---

## フェーズ3: サービス別 Exporter

> Kafka / PostgreSQL / ClickHouse / Redis それぞれのエクスポーターを順番に追加。

### 3-1. kafka-exporter

- [ ] **3-1-1. kafka-exporter マニフェスト作成・適用**
  - `infrastructure/k8s/monitoring/kafka-exporter/manifest.yaml`
  - `--kafka.server=kafka:9092` を環境変数で設定

- [ ] **3-1-2. 動作確認**
  - `kafka_consumer_lag` / `kafka_topic_partition_offset` が取得できること

### 3-2. postgres_exporter

- [ ] **3-2-1. postgres_exporter マニフェスト作成・適用**
  - `infrastructure/k8s/monitoring/postgres-exporter/manifest.yaml`
  - `DATA_SOURCE_NAME` に接続文字列を Secret で渡す

- [ ] **3-2-2. 動作確認**
  - `pg_up` / `pg_stat_activity_count` が取得できること

### 3-3. clickhouse_exporter

- [ ] **3-3-1. clickhouse_exporter マニフェスト作成・適用**
  - `infrastructure/k8s/monitoring/clickhouse-exporter/manifest.yaml`

- [ ] **3-3-2. 動作確認**
  - `clickhouse_up` が 1 であること

### 3-4. redis_exporter

- [ ] **3-4-1. redis_exporter マニフェスト作成・適用**
  - `infrastructure/k8s/monitoring/redis-exporter/manifest.yaml`
  - `REDIS_ADDR=redis:6379`

- [ ] **3-4-2. 動作確認**
  - `redis_up` / `redis_memory_used_bytes` が取得できること

### ✅ フェーズ3 完了基準
- [ ] Prometheus Targets 画面で kafka / postgres / clickhouse / redis exporter が全て `UP`
- [ ] 各サービスの `*_up` メトリクスが 1 を返すこと

---

## フェーズ4: Grafana ダッシュボード

> 6 種類のダッシュボードを作成。グラフは YAML/JSON で管理し再現可能にする。

- [ ] **4-1. Grafana マニフェスト作成・適用**
  - `infrastructure/k8s/monitoring/grafana/manifest.yaml`
  - 100m CPU / 256Mi RAM / PVC 5Gi
  - admin パスワードは Secret で管理
  - Prometheus を DataSource として自動プロビジョニング（`grafana/provisioning/`）

- [ ] **4-2. ダッシュボード JSON 作成（6 枚）**

  | # | ダッシュボード名 | 主なパネル |
  |---|---|---|
  | 1 | クラスター概要 | Pod 死活 / CPU・メモリ / ディスク使用率 |
  | 2 | Kafka パイプライン | consumer lag 推移 / スループット / offset |
  | 3 | PostgreSQL | 接続数・スロークエリ・PVC 使用率 |
  | 4 | ClickHouse | クエリ時間 p50/p95/p99・メモリ |
  | 5 | バッチジョブ | 最終成功時刻・実行時間推移・失敗率 |
  | 6 | Redis | hit 率・メモリ・eviction・keyspace |

  - ダッシュボード JSON を `infrastructure/k8s/monitoring/grafana/dashboards/` に配置
  - ConfigMap 経由で自動ロード（`grafana/provisioning/dashboards/`）

- [ ] **4-3. Port-forward で動作確認**
  ```bash
  kubectl port-forward -n monitoring svc/grafana 3000:3000
  # http://localhost:3000 でダッシュボードが表示されること
  ```

### ✅ フェーズ4 完了基準
- [ ] Grafana に 6 枚のダッシュボードが表示されること
- [ ] 全パネルにデータが入っていること（`No data` がないこと）

---

## フェーズ5: Alertmanager（Slack 通知）

> アラートルーティングを設定。Slack Webhook で通知する。

- [ ] **5-1. Alertmanager マニフェスト作成・適用**
  - `infrastructure/k8s/monitoring/alertmanager/manifest.yaml`
  - 50m CPU / 128Mi RAM
  - Slack Webhook URL は Secret で管理

- [ ] **5-2. Prometheus アラートルール作成**
  - `infrastructure/k8s/monitoring/prometheus/alert-rules.yaml`（PrometheusRule または ConfigMap）

  | アラート | 条件 |
  |---|---|
  | KafkaConsumerLagHigh | lag > 10,000 かつ 5 分継続 |
  | KafkaConsumerLagCritical | lag > 50,000 |
  | PostgresDown | `pg_up == 0` |
  | ClickHouseDown | `clickhouse_up == 0` |
  | PodOOMKilled | OOMKilled > 0 |
  | PodRestartLoop | restartCount > 5 / 1h |
  | DiskPressureWarning | ノードディスク使用率 > 85% |
  | DiskPressureCritical | ノードディスク使用率 > 95% |
  | BatchJobStalenessDaily | `time() - job_last_success_timestamp > 90000`（25h） |

- [ ] **5-3. Alertmanager の routing 設定**
  - WARNING → `#technomart-alerts-warn`
  - CRITICAL → `#technomart-alerts-critical`

- [ ] **5-4. テストアラートで Slack 通知を確認**
  ```bash
  # amtool で手動アラート送信
  kubectl exec -n monitoring deployment/alertmanager -- \
    amtool alert add alertname=TestAlert severity=warning
  ```

### ✅ フェーズ5 完了基準
- [ ] Alertmanager UI で routing ツリーが正しく表示されること
- [ ] テストアラートが Slack に届くこと

---

## フェーズ6: Pushgateway + バッチジョブメトリクス

> スコアリング・名寄せ・Embedding バッチの実行状況を Prometheus で可視化する。

- [ ] **6-1. Pushgateway マニフェスト作成・適用**
  - `infrastructure/k8s/monitoring/pushgateway/manifest.yaml`
  - 50m CPU / 128Mi RAM

- [ ] **6-2. バッチジョブにメトリクス送信を追加**
  - 対象バッチ: スコアリング / 名寄せ / Embedding
  - 各バッチ終了時に以下を Pushgateway へ push
    ```python
    # 例（prometheus_client を使用）
    from prometheus_client import CollectorRegistry, Gauge, push_to_gateway
    registry = CollectorRegistry()
    g = Gauge('job_last_success_timestamp', 'Last success time', registry=registry)
    g.set_to_current_time()
    push_to_gateway('pushgateway:9091', job='scoring_batch', registry=registry)
    ```
  - `job_last_success_timestamp` / `job_duration_seconds` / `job_records_processed` の 3 メトリクス

- [ ] **6-3. Grafana バッチジョブダッシュボードにデータが表示されることを確認**

### ✅ フェーズ6 完了基準
- [ ] バッチ実行後に Pushgateway UI（`:9091`）にメトリクスが表示されること
- [ ] Grafana のバッチジョブダッシュボードで最終成功時刻・実行時間が確認できること
- [ ] `BatchJobStalenessDaily` アラートが 25h 後に発火すること（手動テスト）

---

## フェーズ7: SLO / エラーバジェットダッシュボード

> エンタープライズ向けの可用性・応答時間 SLO を Grafana で可視化する。

- [ ] **7-1. FastAPI に Prometheus メトリクスミドルウェアを追加**
  - `prometheus-fastapi-instrumentator` または `starlette-prometheus` を使用
  - `http_request_duration_seconds` / `http_requests_total` を自動計装

- [ ] **7-2. SLO 定義**

  | SLO | 目標値 | PromQL |
  |---|---|---|
  | Backend API 可用性 | 99.5% / 月 | `avg_over_time(up{job="backend"}[30d])` |
  | Backend API p99 応答時間 | < 2s | `histogram_quantile(0.99, http_request_duration_seconds_bucket)` |
  | スコアリングバッチ成功率 | 99% / 月 | Pushgateway の `job_last_success_timestamp` から算出 |
  | Kafka consumer lag | < 10,000 件（平常時） | `kafka_consumer_lag` |

- [ ] **7-3. SLO / エラーバジェットダッシュボード作成**
  - 直近 30 日の SLO 充足率
  - エラーバジェット残量（%）
  - バジェット消化速度（burn rate）

- [ ] **7-4. pyproject.toml に prometheus-fastapi-instrumentator を追加**
  ```bash
  uv add prometheus-fastapi-instrumentator
  ```
  - backend の Docker イメージを再ビルド・再デプロイ

### ✅ フェーズ7 完了基準
- [ ] Grafana SLO ダッシュボードで 4 つの SLO 全てにデータが表示されること
- [ ] エラーバジェット残量が計算・表示されること

---

## フェーズ8: 最終確認・スナップショット

- [ ] **8-1. 全 Pod の健全性確認**
  ```bash
  kubectl get pods -n monitoring
  kubectl get pods -n default
  # 全 Pod が Running または Completed であること
  ```

- [ ] **8-2. Grafana ダッシュボード全体確認**
  - 6 枚全てのダッシュボードで `No data` がないこと
  - アラートルール一覧で全ルールが `OK` または `Firing` 状態であること

- [ ] **8-3. disk cleanup**
  ```bash
  # 使用していない Docker イメージを削除
  docker image prune -f
  df -h  # ディスク使用率を確認
  ```

- [ ] **8-4. `vagrant snapshot save "v1.3-stable"`**
  ```bash
  cd infrastructure/vagrant/production
  vagrant snapshot save "v1.3-stable"
  vagrant snapshot list
  ```

### ✅ v1.3 完了基準

| 確認項目 | 確認方法 |
|---|---|
| monitoring namespace の全 Pod が Running | `kubectl get pods -n monitoring` |
| Prometheus Targets が全て UP | Prometheus UI `/targets` |
| Grafana ダッシュボード 6 枚が表示される | `localhost:3000` |
| Alertmanager でテストアラートが Slack に届く | amtool / Slack |
| バッチメトリクスが Pushgateway に push される | Pushgateway UI |
| SLO ダッシュボードにデータが表示される | Grafana |
| v1.3-stable スナップショット保存済み | `vagrant snapshot list` |

---

## 作業メモ欄

- 開始日:
- 完了日:
- 注記:
