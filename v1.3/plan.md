# v1.3 アップデート計画 — 監視・オブザーバビリティ

作成日: 2026-03-16
前提: v1.2（基盤データフロー・スコアリング）完了後に着手

---

## 方針

エンタープライズ向けの実案件でも使える構成を目指す。
PoC段階だが設計は本番を想定し、ローカル→AWS移行時の差分を最小化する。

外部SaaSには依存しない（Datadog / New Relic等は使わない）。
完全セルフホスト、OSSスタックで構成する。

---

## 監視スタック構成

### コアスタック

```
Prometheus          — メトリクス収集・保存
Grafana             — ダッシュボード・アラート可視化
Alertmanager        — アラートルーティング（メール / Slack）
Pushgateway         — バッチジョブ等のPushメトリクス受口
```

### Exporter群

| Exporter | 監視対象 | 主なメトリクス |
|---|---|---|
| kafka-exporter | Kafkaトピック | consumer lag, offset, partition数 |
| postgres_exporter | PostgreSQL | 接続数, スロークエリ, レプリケーション遅延 |
| clickhouse_exporter | ClickHouse | クエリ時間, キャッシュヒット率, メモリ使用量 |
| redis_exporter | Redis | hit率, eviction数, メモリ使用量, keyspace |
| kube-state-metrics | k8s全体 | Pod死活, Deployment状態, PVC使用率 |
| node_exporter | VMホスト | CPU, メモリ, ディスク使用率 |

---

## 監視対象と閾値設計

### Kafka

| アラート | 条件 | 重要度 |
|---|---|---|
| consumer lag 増加 | lag > 10,000 かつ 5分継続 | WARNING |
| consumer lag 急増 | lag > 50,000 | CRITICAL |
| トピック書き込み停止 | 10分間メッセージなし | CRITICAL |
| パーティションリーダーなし | under-replicated partitions > 0 | CRITICAL |

### PostgreSQL

| アラート | 条件 | 重要度 |
|---|---|---|
| 接続数逼迫 | active connections > 80% of max | WARNING |
| スロークエリ | 実行時間 > 5s のクエリ存在 | WARNING |
| ディスク使用率 | PVC使用率 > 80% | WARNING |
| 死活 | pg_up == 0 | CRITICAL |

### ClickHouse

| アラート | 条件 | 重要度 |
|---|---|---|
| クエリ遅延 | p99 > 10s | WARNING |
| メモリ使用量 | > 80% of limit | WARNING |
| 死活 | up == 0 | CRITICAL |

### バッチジョブ（Pushgateway経由）

| アラート | 条件 | 重要度 |
|---|---|---|
| スコアリング失敗 | job_last_success_timestamp > 25h (日次) | CRITICAL |
| 名寄せバッチ失敗 | job_last_success_timestamp > 25h (日次) | CRITICAL |
| Embeddingバッチ失敗 | job_last_success_timestamp > 25h (日次) | WARNING |

### インフラ

| アラート | 条件 | 重要度 |
|---|---|---|
| VMディスク残量 | 使用率 > 85% | WARNING |
| VMディスク残量 | 使用率 > 95% | CRITICAL |
| Pod OOMKill | OOMKilled > 0 | CRITICAL |
| Pod 再起動ループ | restartCount > 5 / 1h | WARNING |

---

## Grafanaダッシュボード設計

### 既存のOpsダッシュボード（Next.js）との役割分担

| ダッシュボード | 対象ユーザー | 内容 |
|---|---|---|
| Grafana | エンジニア（インフラ監視） | メトリクス時系列・アラート管理 |
| Ops (/ops/*) | エンジニア（業務確認） | パイプライン実行状況・スキーマ参照 |
| Business (/business/*) | マーケ・店長 | KPI・顧客分析 |

→ Grafanaは純粋にインフラ・ミドルウェア監視に特化させる。業務KPIはNext.jsで見せる。

### Grafanaダッシュボード一覧

```
1. クラスター概要
   └── Pod死活 / CPU・メモリ / ディスク使用率（全サービス）

2. Kafkaパイプライン
   └── consumer lag推移 / メッセージスループット / トピック別offset

3. データベース
   ├── PostgreSQL: 接続数・スロークエリ・PVC使用率
   └── ClickHouse: クエリ時間p50/p95/p99・メモリ

4. バッチジョブ実行状況
   └── 各バッチの最終成功時刻・実行時間推移・失敗率

5. Redis
   └── hit率・メモリ使用率・eviction数・keyspace

6. SLI/SLO（エンタープライズ向け）
   └── API応答時間p99・エラー率・可用性（直近30日）
```

---

## SLI / SLO 設計（エンタープライズ向け）

実案件で求められる水準を想定。

| SLO | 目標値 | 計測方法 |
|---|---|---|
| Backend API 可用性 | 99.5% / 月 | Prometheusの`up`メトリクス |
| Backend API p99応答時間 | < 2s | FastAPI → Prometheus middleware |
| スコアリングバッチ 成功率 | 99% / 月 | Pushgateway + カスタムメトリクス |
| Kafka consumer lag | < 10,000 件 (平常時) | kafka-exporter |
| ダッシュボード初回表示 | < 3s (p95) | Next.js → Web Vitals |

エラーバジェットを設定し、バジェット消化率をGrafanaで可視化する。

---

## 分散トレーシング（将来オプション）

v1.2の必須スコープではないが、エンタープライズ向けに検討すべき項目。

```
OpenTelemetry Collector
├── FastAPI → OTLP traces
├── Next.js → OTLP traces (instrumentation)
└── → Jaeger（ローカル）/ X-Ray（AWS移行後）
```

FastAPIはOpenTelemetryの自動計装（`opentelemetry-instrument`）で
コード変更なしにトレースが取れる。AWS移行後はX-Rayに切り替え。

---

## k8s リソース構成

```
namespace: monitoring

Deployments:
  prometheus        200m CPU / 1Gi RAM（保存期間 15日）
  grafana           100m CPU / 256Mi RAM
  alertmanager      50m CPU / 128Mi RAM
  pushgateway       50m CPU / 128Mi RAM

DaemonSet:
  node_exporter     （全ノード）

Deployments（各exporter）:
  kafka-exporter
  postgres-exporter
  clickhouse-exporter
  redis-exporter
  kube-state-metrics

PersistentVolumeClaim:
  prometheus-data   20Gi（メトリクス保存）
  grafana-data      5Gi（ダッシュボード設定）
```

---

## AWS移行時の対応

| ローカル | AWS | 移行コスト |
|---|---|---|
| Prometheus | Amazon Managed Prometheus (AMP) | 設定ファイルほぼ同じ |
| Grafana | Amazon Managed Grafana (AMG) | ダッシュボードJSONをインポート |
| Alertmanager | AMG Alerting | 書き換え必要 |
| Jaeger | AWS X-Ray | OTel CollectorのExporter変更のみ |

→ Prometheus/Grafanaをセルフホストで設計しておけば、
　 AMPへの移行はリモートライト設定の追加だけで対応できる。

---

## 実装順序

```
Step 1: namespace: monitoring 作成 + Prometheus + node_exporter
Step 2: kube-state-metrics（Pod死活の基本監視）
Step 3: 各サービスexporter（Kafka → PostgreSQL → ClickHouse → Redis）
Step 4: Grafanaダッシュボード作成
Step 5: Alertmanager設定（Slack通知）
Step 6: Pushgateway + バッチジョブメトリクス送信実装
Step 7: SLO/エラーバジェットダッシュボード
Step 8: OpenTelemetry（オプション）
```
