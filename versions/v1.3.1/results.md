# v1.3.1 メモリ計測結果

計測日: 2026-03-21

## 環境

- VM RAM: 48GB allocated (vb.memory = 49152)
- VM CPU: 10コア
- k3s version: v1.31.x
- Ollama models: qwen2.5:3b, nomic-embed-text
- 監視スタック: Prometheus / Grafana / Alertmanager / Pushgateway / 各 Exporter (6種) / Loki

---

## シナリオ別計測結果（VM ホスト視点 / `free -h`）

| シナリオ | Node Used (kubectl top) | Host Used (free -h) | Host Available | 備考 |
|---|---|---|---|---|
| A: アイドル | 4,151 Mi | 4.1 GB | 42 GB | 全サービス起動済み・バッチ未実行 |
| B: API 10並列 | 4,184 Mi | 4.2 GB | 42 GB | backendへHTTPリクエスト10並列 |
| C: ClickHouse クエリ | 4,189 Mi | 4.2 GB | 42 GB | pos_transactions 月次集計（10年分） |
| D: Ollama 1並列 | 6,281 Mi | 6.3 GB | 40 GB | qwen2.5:3b 推論 1リクエスト |
| D: Ollama 3並列 | 6,432 Mi | 6.3 GB | 40 GB | qwen2.5:3b 推論 3並列 |
| E: スコアリングバッチ | 6,334 Mi | 6.3 GB | 40 GB | scoring-daily CronJob手動実行 |
| G: 全同時（ピーク） | 6,330 Mi | 6.3 GB | 40 GB | B+C+D(3並列)+E 同時実行 |

> **注記:** Ollama がロード済みの場合、3並列と1並列でRAM使用量はほぼ変わらない（モデルは1回だけロードされる）。
> ピークは Ollama モデルロード直後: **~6.4 GB**

---

## Pod 別 RAM（シナリオ A: アイドル時）

### technomart namespace

| Pod | RAM |
|---|---|
| kafka-0 | 952 Mi |
| clickhouse | 406 Mi |
| localstack | 417 Mi |
| backend | 89 Mi |
| frontend | 65 Mi |
| postgresql | 54 Mi |
| registry | 41 Mi |
| redis | 12 Mi |
| fluent-bit | 8 Mi |
| **小計** | **~2,044 Mi** |

### monitoring namespace

| Pod | アイドル | ピーク(G) |
|---|---|---|
| prometheus | 72 Mi | 74 Mi |
| grafana | 62 Mi | 52 Mi |
| loki | 58 Mi | 62 Mi |
| clickhouse-exporter | 51 Mi | 67 Mi |
| pushgateway | 17 Mi | 14 Mi |
| alertmanager | 14 Mi | 14 Mi |
| kube-state-metrics | 13 Mi | 13 Mi |
| postgres-exporter | 12 Mi | 12 Mi |
| redis-exporter | 11 Mi | 8 Mi |
| node-exporter | 10 Mi | 10 Mi |
| kafka-exporter | 9 Mi | 9 Mi |
| **小計** | **~329 Mi** | **~335 Mi** |

### Ollama（シナリオ D/G）

| 状態 | RAM |
|---|---|
| アイドル（モデル未ロード） | ~11 Mi |
| モデルロード後（qwen2.5:3b） | ~2,129〜2,160 Mi |

---

## 全体サマリー

| 状態 | 合計 RAM 使用量 |
|---|---|
| アイドル（Ollama未ロード） | **~4.1 GB** |
| 通常稼働（Ollama ロード済み） | **~6.3〜6.4 GB** |
| ピーク（全同時負荷） | **~6.4 GB** |

---

## v1.2.1 比 増分（監視スタック + Loki）

> v1.2.1 のアイドル RAM は別途計測が必要（現バージョンでは未取得）。
> 監視スタック単体の増分は monitoring namespace Pod 合計から推算。

| コンポーネント | 増分 RAM |
|---|---|
| Prometheus | ~72 Mi |
| Grafana | ~62 Mi |
| Loki | ~58 Mi |
| Alertmanager + Pushgateway | ~31 Mi |
| Exporter 群 (6種) | ~106 Mi |
| **合計（監視スタック）** | **~329 Mi (~0.3 GB)** |

plan.md の見積もり（~2.1 GB）より**大幅に少ない**。
JVM不使用の軽量コンポーネント群のため、実態は ~300 MB 程度に収まった。

---

## ディスク使用状況

| 計測タイミング | 使用率 | 備考 |
|---|---|---|
| v1.3.1 作業開始時（スナップショット前） | 59% (17 GB / 31 GB) | Grafana ダッシュボードでは88.1%（共有フォルダの誤集計） |
| Loki デプロイ後 | 94% (27 GB / 31 GB) | Loki イメージ(~1.5GB) + PVC provisioning で増加 |

> ⚠️ **注意**: ディスクが 94% と逼迫している。Vagrantfile の `vb.disk` 拡張を検討。
> Vagrant 共有フォルダ(`/technomart`, `/vagrant`)が Windows Cドライブ(931GB/95%)をマウントしており、
> k3s が DiskPressure と一時的に誤判定するケースがあった（実態は `/` のみ監視すれば十分）。

---

## 推奨 RAM 値（最終決定）

| 構成 | RAM | 根拠 |
|---|---|---|
| 最小動作（アイドルのみ） | 8 GB | アイドル 4.1 GB × 2.0（バッファ） |
| **開発推奨（通常稼働）** | **16 GB** | ピーク 6.4 GB × 2.5（Ollama + 余裕） |
| 余裕あり（全負荷 + Docker ビルド） | 24 GB | ピーク 6.4 GB + Docker 2 GB × 2.5 |

### Vagrantfile 更新値

```ruby
vb.memory = "16384"  # 16 GB（開発推奨）
vb.cpus   = 10
```

現在のアロケーション（48 GB）は大幅に余裕あり。
実使用は最大 6.4 GB のため、**16 GB に削減しても問題なし**。
ただしこのホストは 128 GB RAM のため、現状維持でも可。

---

## 判断

plan.md の判断基準より:

| ピーク | 該当レンジ | 推奨 vb.memory |
|---|---|---|
| ~6.4 GB | ～ 8GB | `12288` (12 GB) |

→ ただし Ollama の将来的な大型モデル使用を考慮し、**`16384` (16 GB)** を採用。
現在の 48 GB 設定は余裕を持ちすぎているため、Vagrantfile は更新せず現状維持とする
（本番移行時の参考値として結果のみ記録）。
