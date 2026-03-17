# v1.2.1 アップデート計画 — メモリ要件の実測・最適化

作成日: 2026-03-18
前提: v1.2（データフロー実装）完了後に着手

---

## 作業ルール

**バージョンアップ作業を開始する前に必ずスナップショットを保存する。**

```bash
cd infrastructure/vagrant/production
vagrant snapshot save "pre-v1.2.1"
```

理由: DiskPressure・誤操作・設定ミスでクラッシュした際に `vagrant snapshot restore pre-v1.2.1` で即座に復旧できる。

---

## 目的

現在 VirtualBox に **48GB RAM** を割り当てているが、実際の消費量は約 3.8GB（7%）にとどまる。
v1.2 でデータパイプライン（Kafka→PostgreSQL・ClickHouse・Redis・スコアリングバッチ・Ollama 推論）が本格稼働した後に実測し、**v1.2 完了時点のベースライン RAM を記録する**。

### 計測タイミングについて

RAM 要件の計測は **2段階** で実施する。

| フェーズ | 対象バージョン | 内容 |
|---|---|---|
| **フェーズ 1**（本 plan） | **v1.2.1**（本計画） | v1.2 完了後のベースライン記録。監視スタックなし |
| **フェーズ 2** | **v1.3.1**（後続計画） | v1.3 監視スタック（Prometheus/Grafana/各 Exporter）追加後の**最終ピーク計測** → Vagrantfile 更新 |

v1.3 の監視スタックは単体で **+約 2GB**（Prometheus 1GB + Grafana 256MB + Exporter 群）を消費する見込みのため、
**推奨 RAM 値の最終決定と Vagrantfile 更新は v1.3.1 で実施する**。

### v1.2.1 のゴール

| ゴール | 内容 |
|---|---|
| ベースライン記録 | v1.2 スタックの各シナリオでの Pod・ノード・ホスト RAM 使用量を記録 |
| v1.3 向け参照値の確保 | 監視スタック追加前の基準値として `v1.2.1/results.md` に保存 |
| Vagrantfile 更新 | **v1.3.1 で実施**（監視スタック込みの最終値が出てから） |

---

## 背景・前提知識

### 現時点のスタック（v1.2 完了後）

| サービス | 用途 | 想定 RAM |
|---|---|---|
| k3s control plane | Kubernetes | ~300MB |
| Kafka (KRaft) | ストリーミング | ~512MB |
| PostgreSQL + pgvector | 統合 DB | ~256MB |
| ClickHouse | 分析 DB | ~512MB |
| Redis | キャッシュ | ~64MB |
| LocalStack (S3) | オブジェクトストレージ | ~256MB |
| Ollama (qwen2.5:3b + nomic-embed-text) | LLM | ~2–4GB |
| FastAPI backend | API | ~256MB |
| Next.js frontend | UI | ~256MB |
| スコアリングバッチ（起動時のみ） | バッチ処理 | ~256MB |

**現在のアイドル時合計**: ~3.8GB（実測済み）

### HPA 非設定の影響

HPA（Horizontal Pod Autoscaler）は未設定のため、負荷が増えてもレプリカ数は増えない。
RAM 増加は Pod ごとのメモリ消費が増加する形で現れる。

---

## 計測シナリオ

### シナリオ A: アイドル状態（ベースライン）

全サービス起動済みのアイドル状態。スコアリングバッチ未実行。

```bash
vagrant ssh -c "
  echo '=== Node ===' && kubectl top nodes
  echo '=== Pods ===' && kubectl top pods -n technomart --sort-by=memory
  echo '=== Host ===' && free -h && cat /proc/meminfo | grep -E 'MemTotal|MemAvailable|MemFree'
"
```

### シナリオ B: API 並列リクエスト（10 並列）

Next.js → FastAPI → PostgreSQL への並列リクエストを発生させ、API 層の RAM を計測。

```bash
# ホストから実行（Apache Bench / curl ループ）
for i in $(seq 1 10); do
  curl -s http://192.168.56.10:30300/api/healthz &
done
wait

# VM 内で計測
vagrant ssh -c "kubectl top pods -n technomart --sort-by=memory"
```

### シナリオ C: ClickHouse 分析クエリ

S3 からロードした購買データへの集計クエリ（大量 JOIN・GROUP BY）を実行。

```bash
vagrant ssh -c "
  kubectl exec -n technomart deploy/clickhouse -- \
    clickhouse-client --query '
      SELECT
        toStartOfMonth(event_time) AS month,
        category,
        count() AS cnt,
        sum(amount) AS total
      FROM events
      WHERE event_time >= today() - 365
      GROUP BY month, category
      ORDER BY month, total DESC
    '
  kubectl top pods -n technomart -l app=clickhouse
"
```

### シナリオ D: Ollama 推論（自然言語クエリ）

`qwen2.5:3b` で日本語プロンプトを処理。同時リクエストは 1→3→5 と段階的に増やす。

```bash
# 1 並列
vagrant ssh -c "
  kubectl exec -n technomart deploy/ollama -- \
    ollama run qwen2.5:3b '顧客セグメント分析の結果を要約して'
"

# 3 並列（バックグラウンド）
for i in 1 2 3; do
  vagrant ssh -c "kubectl exec -n technomart deploy/ollama -- ollama run qwen2.5:3b 'テスト ${i}'" &
done
wait

vagrant ssh -c "kubectl top pods -n technomart -l app=ollama"
```

### シナリオ E: スコアリングバッチ実行

日次スコアリングバッチ（カテゴリ親和性）を手動トリガーして RAM ピークを計測。

```bash
vagrant ssh -c "
  kubectl create job --from=cronjob/scoring-batch scoring-batch-manual-$(date +%s) -n technomart
  sleep 30
  kubectl top pods -n technomart --sort-by=memory
  kubectl top nodes
"
```

### シナリオ F: pgvector 類似検索（Embedding）

`nomic-embed-text` で Embedding 生成 → pgvector で ANN 検索。

```bash
vagrant ssh -c "
  # Embedding バッチ実行後に計測
  kubectl top pods -n technomart -l app=backend
  kubectl top pods -n technomart -l app=ollama
  kubectl top pods -n technomart -l app=postgresql
"
```

### シナリオ G: 全シナリオ同時（ピーク推定）

B + C + D（3並列）+ E を同時実行してピーク RAM を計測。

---

## 計測手順

### ステップ 1: 計測ツールの確認

```bash
vagrant ssh -c "
  # kubectl top が動くか確認（metrics-server が必要）
  kubectl top nodes
  kubectl top pods -n technomart
  # free コマンド確認
  free -h
"
```

metrics-server が未インストールの場合:
```bash
vagrant ssh -c "
  kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
  # TLS 検証を無効化（ローカル k3s の場合）
  kubectl patch deployment metrics-server -n kube-system --type=json \
    -p='[{\"op\":\"add\",\"path\":\"/spec/template/spec/containers/0/args/-\",\"value\":\"--kubelet-insecure-tls\"}]'
"
```

### ステップ 2: ベースライン計測（シナリオ A）

```bash
vagrant ssh -c "
  echo '--- ベースライン計測 ---'
  date
  kubectl top nodes
  kubectl top pods -n technomart --sort-by=memory
  free -h
  echo '---'
" | tee /tmp/baseline.txt
```

### ステップ 3: 各シナリオ実行 → 計測

各シナリオ実行中・実行直後に以下を繰り返す:

```bash
vagrant ssh -c "
  kubectl top nodes && kubectl top pods -n technomart --sort-by=memory && free -h
"
```

### ステップ 4: ピーク値の記録

結果を `v1.2.1/results.md` に記録する（テンプレートは下記）。

---

## 結果記録テンプレート

`v1.2.1/results.md` に以下の形式で記録する:

```markdown
# v1.2.1 メモリ計測結果

計測日: YYYY-MM-DD

## 環境
- VM RAM: 48GB allocated
- k3s version: X.X.X
- Ollama models: qwen2.5:3b, nomic-embed-text

## シナリオ別ピーク RAM（VM ホスト視点）

| シナリオ | Used (free -h) | Available | Notes |
|---|---|---|---|
| A: アイドル | X.XGB | X.XGB | |
| B: API 10並列 | | | |
| C: ClickHouse クエリ | | | |
| D: Ollama 1並列 | | | |
| D: Ollama 3並列 | | | |
| E: スコアリングバッチ | | | |
| F: pgvector 検索 | | | |
| G: 全同時（ピーク） | | | |

## Pod 別ピーク RAM

| Pod | アイドル | ピーク | 増分 |
|---|---|---|---|
| ollama | | | |
| clickhouse | | | |
| postgresql | | | |
| kafka | | | |
| backend | | | |
| frontend | | | |

## 推奨 RAM 値

| 構成 | RAM | 根拠 |
|---|---|---|
| 最小動作（アイドルのみ） | X GB | ピークアイドル × 1.5 |
| 開発推奨（並列 API + バッチ） | X GB | ピーク G × 1.3 |
| 余裕あり（全負荷 + Docker ビルド） | X GB | ピーク G + Docker 2GB × 1.3 |
```

---

## 判断基準

| 計測ピーク（全負荷） | 推奨 Vagrantfile 設定 | 対象 PC |
|---|---|---|
| ～ 8GB | 12GB | ミドルレンジ PC (16GB RAM) |
| ～ 12GB | 16GB | ハイエンド PC (32GB RAM) |
| ～ 20GB | 24GB | ワークステーション (32GB+) |
| 20GB 超 | スタック縮小を検討 | Ollama をオフロード等 |

### スタック縮小オプション（RAM 不足時）

1. **Ollama を外部 API に切り替え**: 最大 3–4GB 削減。抽象化レイヤー経由なので変更最小。
2. **ClickHouse のメモリ上限を制限**: `max_memory_usage` を設定（デフォルト無制限）
3. **Kafka のヒープを削減**: `KAFKA_HEAP_OPTS=-Xmx256m` 等

---

## Vagrantfile 更新手順

```ruby
# infrastructure/vagrant/production/Vagrantfile
config.vm.provider "virtualbox" do |vb|
  vb.memory = "XXXX"   # 計測結果に基づいて変更
  vb.cpus   = 10
end
```

変更後:
```bash
vagrant reload
vagrant snapshot save "v1.2.1-stable"
```

---

## 完了基準

| 確認項目 | 確認方法 | タイミング |
|---|---|---|
| 全シナリオの計測値が記録されていること | `v1.2.1/results.md` に数値あり | v1.2.1 |
| v1.2 ベースライン RAM 値が確定していること | results.md の「シナリオ別ピーク」セクション | v1.2.1 |
| 推奨 RAM 値が決定されていること | `v1.3.1/results.md` の「推奨 RAM 値」セクション | **v1.3.1** |
| Vagrantfile が更新されていること | `git diff Vagrantfile` | **v1.3.1** |
| v1.2.1-stable スナップショットが保存されていること | `vagrant snapshot list` | v1.2.1 |

> **Vagrantfile の `vb.memory` 更新は v1.3.1 まで保留**。
> 監視スタック（+約 2GB）込みの最終ピーク値が出てから設定値を決める。
