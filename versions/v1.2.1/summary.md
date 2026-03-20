# v1.2.1 ベースライン計測サマリー

計測日: 2026-03-20
環境: Ubuntu 24.04 LTS / k3s / 10vCPU / 48GB RAM (VM)
位置づけ: 2段階 RAM 計測のフェーズ1（監視スタックなし状態のベースライン）

---

## ノード + ホストメモリ計測結果

| シナリオ | node_mem_used_mi | host_mem_used_gb | host_mem_available_gb | node_cpu_m |
|---|---|---|---|---|
| A_idle | 4,093 Mi | 3.8 GB | 43.3 GB | 341 m |
| B_api_10parallel | 4,098 Mi | 3.8 GB | 43.2 GB | 458 m |
| C_clickhouse_query2 | 4,099 Mi | 3.8 GB | 43.2 GB | 561 m |
| D_ollama_1 | 4,100 Mi | 4.5 GB | 42.6 GB | 901 m |
| D_ollama_3 | 6,303 Mi | 6.1 GB | 41.0 GB | 2,216 m |
| E_scoring_batch | 6,366 Mi | 6.0 GB | 41.1 GB | 2,086 m |
| F_pgvector | 6,309 Mi | 6.0 GB | 41.1 GB | 2,983 m |
| G_peak_all | 6,327 Mi | **6.2 GB** | 40.9 GB | 2,233 m |

> ※ C_clickhouse_query は計測タイミングのブレで複数記録あり。C_clickhouse_query2 を正式値とする。

---

## Pod 別メモリ（アイドル時: A_idle）

| Pod | CPU (m) | MEM (Mi) |
|---|---|---|
| clickhouse | 211 | 1,224 |
| kafka-0 | 44 | 947 |
| localstack | 3 | 258 |
| backend | 4 | 89 |
| frontend | 2 | 62 |
| ollama | 1 | 57 |
| postgresql | 84 | 52 |
| registry | 1 | 34 |
| fluent-bit | 5 | 31 |
| redis | 38 | 12 |

---

## ピーク値（v1.3.1 への引き継ぎ値）

| 指標 | 値 | シナリオ |
|---|---|---|
| **ノードメモリ最大** | **6,366 Mi** | E_scoring_batch |
| **ホストメモリ最大** | **6.2 GB** | G_peak_all |
| **CPU最大** | **2,983 m** | F_pgvector |

### v1.3.1 での想定増加分（監視スタック追加）

| コンポーネント | 想定RAM |
|---|---|
| Prometheus | ~200 Mi |
| Grafana | ~150 Mi |
| Loki | ~100 Mi |
| Alertmanager | ~50 Mi |
| **合計増加** | **~500 Mi** |

**v1.3.1 想定ピーク**: 6,366 + 500 ≈ **6,900 Mi**（約6.7 GB）

→ 現在の Vagrantfile `vb.memory = 49152`（48 GB）は十分。
→ v1.3.1 計測後に余裕を確認し、Vagrantfile の推奨値として明記する。

---

## 注記

- Ollama（qwen2.5:3b）はリクエスト中に ~2,000 Mi まで上昇する（アイドル57 Mi → 推論時1,200 Mi程度）
- ClickHouse アイドル時でも 1,224 Mi を消費（最大の単一 Pod）
- Kafka はアイドル時947 Mi だが負荷時の増加は小さい
- scoring-daily CronJob が ImagePullBackOff になっている点は別途確認が必要
- `F_pgvector` はバッチ直後の残留 CPU が高い（2,983 m）

---

## 参照ファイル

- `versions/v1.2.1/results_baseline.csv` — ノード/ホスト計測値（10行）
- `versions/v1.2.1/results_pods.csv` — Pod別計測値（100行）
