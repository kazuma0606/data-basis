# v1.2.1 タスクリスト — メモリ要件ベースライン計測

作成日: 2026-03-20
参照: versions/v1.2.1/plan.md
前提: v1.2（データフロー実装）完了後に着手
位置づけ: 2段階 RAM 計測のフェーズ1。監視スタックなし状態のベースラインを記録する。

進捗凡例: `[ ]` 未着手 / `[>]` 作業中 / `[x]` 完了 / `[-]` スキップ

---

## フェーズ-1: 作業前スナップショット（必須）

- [ ] **-1-1. スナップショット一覧を確認**
  ```bash
  cd infrastructure/vagrant/production
  vagrant snapshot list
  # → v1.2-stable が存在すること
  ```

- [ ] **-1-2. 作業前スナップショットを保存**
  ```bash
  vagrant snapshot save "pre-v1.2.1"
  vagrant snapshot list
  ```

### ✅ フェーズ-1 完了基準
- [ ] `pre-v1.2.1` がスナップショット一覧に表示されること

---

## フェーズ1: 計測ツールの準備

- [ ] **1-1. metrics-server の動作確認**
  ```bash
  vagrant ssh -c "kubectl top nodes"
  # エラーが出る場合は 1-2 へ
  ```

- [ ] **1-2. metrics-server が未インストールの場合のみ適用**
  ```bash
  vagrant ssh -c "
    kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
    kubectl patch deployment metrics-server -n kube-system --type=json \
      -p='[{\"op\":\"add\",\"path\":\"/spec/template/spec/containers/0/args/-\",\"value\":\"--kubelet-insecure-tls\"}]'
    sleep 30
    kubectl top nodes
  "
  ```

- [ ] **1-3. CSV 出力スクリプトの配置**
  - `infrastructure/scripts/measure_ram.sh` を作成（フェーズ2 で使用）
  - スクリプト内容は下記参照

  ```bash
  #!/bin/bash
  # measure_ram.sh — RAM 計測結果を CSV に追記する
  # 使い方: ./measure_ram.sh <シナリオ名> <出力CSVパス>
  # 例: ./measure_ram.sh "A_idle" /vagrant/versions/v1.2.1/results_baseline.csv

  SCENARIO=$1
  CSV=$2
  TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  # ヘッダーがなければ書き込む
  if [ ! -f "$CSV" ]; then
    echo "timestamp,scenario,node_cpu_cores,node_mem_used_mi,node_mem_capacity_mi,host_mem_total_gb,host_mem_used_gb,host_mem_available_gb" > "$CSV"
  fi

  # ノードメトリクス取得
  NODE_LINE=$(kubectl top nodes --no-headers 2>/dev/null | head -1)
  NODE_CPU=$(echo "$NODE_LINE" | awk '{print $2}' | tr -d 'm')
  NODE_MEM_USED=$(echo "$NODE_LINE" | awk '{print $4}' | tr -d 'Mi')
  NODE_MEM_CAP=$(kubectl get nodes --no-headers -o custom-columns="MEM:.status.capacity.memory" 2>/dev/null | head -1 | tr -d 'Ki' | awk '{printf "%d", $1/1024}')

  # ホストメモリ取得（free -m の出力から）
  MEM_LINE=$(free -m | grep "^Mem:")
  HOST_TOTAL=$(echo "$MEM_LINE" | awk '{printf "%.1f", $2/1024}')
  HOST_USED=$(echo "$MEM_LINE" | awk '{printf "%.1f", $3/1024}')
  HOST_AVAIL=$(echo "$MEM_LINE" | awk '{printf "%.1f", $7/1024}')

  echo "${TIMESTAMP},${SCENARIO},${NODE_CPU},${NODE_MEM_USED},${NODE_MEM_CAP},${HOST_TOTAL},${HOST_USED},${HOST_AVAIL}" >> "$CSV"
  echo "[recorded] ${SCENARIO} → ${CSV}"
  ```

- [ ] **1-4. Pod 別 CSV 出力スクリプトの配置**
  - `infrastructure/scripts/measure_pods.sh` を作成

  ```bash
  #!/bin/bash
  # measure_pods.sh — Pod 別 RAM 計測結果を CSV に追記する
  # 使い方: ./measure_pods.sh <シナリオ名> <namespace> <出力CSVパス>
  # 例: ./measure_pods.sh "A_idle" "default" /vagrant/versions/v1.2.1/results_pods.csv

  SCENARIO=$1
  NAMESPACE=$2
  CSV=$3
  TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  if [ ! -f "$CSV" ]; then
    echo "timestamp,scenario,namespace,pod,cpu_m,mem_mi" > "$CSV"
  fi

  kubectl top pods -n "$NAMESPACE" --no-headers 2>/dev/null | while read -r POD CPU MEM; do
    CPU_VAL=$(echo "$CPU" | tr -d 'm')
    MEM_VAL=$(echo "$MEM" | tr -d 'Mi')
    echo "${TIMESTAMP},${SCENARIO},${NAMESPACE},${POD},${CPU_VAL},${MEM_VAL}" >> "$CSV"
  done
  echo "[recorded] pods in ${NAMESPACE} for ${SCENARIO} → ${CSV}"
  ```

### ✅ フェーズ1 完了基準
- [ ] `kubectl top nodes` がエラーなく返ること
- [ ] `kubectl top pods -n default` がエラーなく返ること
- [ ] `measure_ram.sh` / `measure_pods.sh` が VM 上で実行できること

---

## フェーズ2: 計測実施

計測結果は VM 上から直接 CSV に書き込む。
出力先: `/vagrant/versions/v1.2.1/results_baseline.csv`（ホストと共有）

### シナリオ A: アイドル状態（ベースライン）

> 全サービス起動済み・バッチ未実行の状態。最も重要な基準値。

- [ ] **A-1. 全 Pod が Running であることを確認**
  ```bash
  vagrant ssh -c "kubectl get pods -n default"
  # 全て Running / Completed であること
  ```

- [ ] **A-2. ノード + ホスト RAM を CSV に記録**
  ```bash
  vagrant ssh -c "bash /vagrant/infrastructure/scripts/measure_ram.sh \
    'A_idle' '/vagrant/versions/v1.2.1/results_baseline.csv'"
  ```

- [ ] **A-3. Pod 別 RAM を CSV に記録**
  ```bash
  vagrant ssh -c "bash /vagrant/infrastructure/scripts/measure_pods.sh \
    'A_idle' 'default' '/vagrant/versions/v1.2.1/results_pods.csv'"
  ```

---

### シナリオ B: API 並列リクエスト（10 並列）

- [ ] **B-1. 10 並列リクエストを発行**
  ```bash
  for i in $(seq 1 10); do
    curl -s http://192.168.56.10:30300/api/healthz &
  done
  wait
  ```

- [ ] **B-2. リクエスト中に計測**
  ```bash
  vagrant ssh -c "
    bash /vagrant/infrastructure/scripts/measure_ram.sh \
      'B_api_10parallel' '/vagrant/versions/v1.2.1/results_baseline.csv'
    bash /vagrant/infrastructure/scripts/measure_pods.sh \
      'B_api_10parallel' 'default' '/vagrant/versions/v1.2.1/results_pods.csv'
  "
  ```

---

### シナリオ C: ClickHouse 分析クエリ

- [ ] **C-1. 集計クエリを実行しながら計測**
  ```bash
  vagrant ssh -c "
    kubectl exec -n default deploy/clickhouse -- \
      clickhouse-client --query '
        SELECT toStartOfMonth(event_time) AS month, category, count() AS cnt, sum(amount) AS total
        FROM events WHERE event_time >= today() - 365
        GROUP BY month, category ORDER BY month, total DESC
      ' &
    sleep 3
    bash /vagrant/infrastructure/scripts/measure_ram.sh \
      'C_clickhouse_query' '/vagrant/versions/v1.2.1/results_baseline.csv'
    bash /vagrant/infrastructure/scripts/measure_pods.sh \
      'C_clickhouse_query' 'default' '/vagrant/versions/v1.2.1/results_pods.csv'
  "
  ```

---

### シナリオ D: Ollama 推論

- [ ] **D-1. 1 並列で計測**
  ```bash
  vagrant ssh -c "
    kubectl exec -n default deploy/ollama -- \
      ollama run qwen2.5:3b '顧客セグメント分析の結果を要約して' &
    sleep 5
    bash /vagrant/infrastructure/scripts/measure_ram.sh \
      'D_ollama_1' '/vagrant/versions/v1.2.1/results_baseline.csv'
    bash /vagrant/infrastructure/scripts/measure_pods.sh \
      'D_ollama_1' 'default' '/vagrant/versions/v1.2.1/results_pods.csv'
  "
  ```

- [ ] **D-2. 3 並列で計測**
  ```bash
  vagrant ssh -c "
    for i in 1 2 3; do
      kubectl exec -n default deploy/ollama -- ollama run qwen2.5:3b 'テスト ${i}' &
    done
    sleep 5
    bash /vagrant/infrastructure/scripts/measure_ram.sh \
      'D_ollama_3' '/vagrant/versions/v1.2.1/results_baseline.csv'
    bash /vagrant/infrastructure/scripts/measure_pods.sh \
      'D_ollama_3' 'default' '/vagrant/versions/v1.2.1/results_pods.csv'
    wait
  "
  ```

---

### シナリオ E: スコアリングバッチ

- [ ] **E-1. バッチを手動トリガーして計測**
  ```bash
  vagrant ssh -c "
    kubectl create job --from=cronjob/scoring-batch \
      scoring-batch-manual-\$(date +%s) -n default
    sleep 30
    bash /vagrant/infrastructure/scripts/measure_ram.sh \
      'E_scoring_batch' '/vagrant/versions/v1.2.1/results_baseline.csv'
    bash /vagrant/infrastructure/scripts/measure_pods.sh \
      'E_scoring_batch' 'default' '/vagrant/versions/v1.2.1/results_pods.csv'
  "
  ```

---

### シナリオ F: pgvector 類似検索（Embedding）

- [ ] **F-1. Embedding バッチ実行後に計測**
  ```bash
  vagrant ssh -c "
    bash /vagrant/infrastructure/scripts/measure_ram.sh \
      'F_pgvector' '/vagrant/versions/v1.2.1/results_baseline.csv'
    bash /vagrant/infrastructure/scripts/measure_pods.sh \
      'F_pgvector' 'default' '/vagrant/versions/v1.2.1/results_pods.csv'
  "
  ```

---

### シナリオ G: 全シナリオ同時（ピーク推定）

> B + C + D（3並列）+ E を同時実行する。

- [ ] **G-1. 全負荷を同時発生させて計測**
  ```bash
  # ホスト側でAPIリクエスト（B）
  for i in $(seq 1 10); do curl -s http://192.168.56.10:30300/api/healthz & done

  vagrant ssh -c "
    # ClickHouseクエリ（C）
    kubectl exec -n default deploy/clickhouse -- \
      clickhouse-client --query 'SELECT count() FROM events' &
    # Ollamaリクエスト3並列（D）
    for i in 1 2 3; do
      kubectl exec -n default deploy/ollama -- ollama run qwen2.5:3b 'テスト' &
    done
    # スコアリングバッチ（E）
    kubectl create job --from=cronjob/scoring-batch scoring-peak-\$(date +%s) -n default
    sleep 30
    bash /vagrant/infrastructure/scripts/measure_ram.sh \
      'G_peak_all' '/vagrant/versions/v1.2.1/results_baseline.csv'
    bash /vagrant/infrastructure/scripts/measure_pods.sh \
      'G_peak_all' 'default' '/vagrant/versions/v1.2.1/results_pods.csv'
    wait
  "
  ```

---

## フェーズ3: CSV 確認・サマリー作成

- [ ] **3-1. CSV の内容を確認**
  ```bash
  # ノード/ホスト計測結果
  cat versions/v1.2.1/results_baseline.csv

  # Pod 別計測結果
  cat versions/v1.2.1/results_pods.csv
  ```

- [ ] **3-2. 最大値（ピーク）を確認**
  ```bash
  # host_mem_used_gb が最大のシナリオを確認
  sort -t',' -k7 -rn versions/v1.2.1/results_baseline.csv | head -3
  ```

- [ ] **3-3. サマリーを `versions/v1.2.1/summary.md` に記録**
  - 各シナリオのピーク値（host_mem_used_gb）を転記
  - v1.3.1 で使う「v1.2.1 ベースライン」の参照値を明記
  - 増加が目立つ Pod を特記

### ✅ フェーズ2〜3 完了基準
- [ ] `results_baseline.csv` に A〜G 全シナリオの行が存在すること
- [ ] `results_pods.csv` に A〜G 全シナリオ × 全 Pod の行が存在すること
- [ ] `summary.md` にピーク値と v1.3.1 への引き継ぎ値が記載されていること

---

## フェーズ4: スナップショット保存

- [ ] **4-1. `v1.2.1-stable` スナップショットを保存**
  ```bash
  cd infrastructure/vagrant/production
  vagrant snapshot save "v1.2.1-stable"
  vagrant snapshot list
  ```

- [ ] **4-2. CSV ファイルを git にコミット**
  ```bash
  git add versions/v1.2.1/results_baseline.csv \
          versions/v1.2.1/results_pods.csv \
          versions/v1.2.1/summary.md
  git commit -m "data: Add v1.2.1 baseline RAM measurement results"
  git push
  ```

### ✅ v1.2.1 完了基準

| 確認項目 | 確認方法 |
|---|---|
| A〜G 全シナリオの計測値が CSV に記録されていること | `wc -l versions/v1.2.1/results_baseline.csv` が 9 行以上（ヘッダー + 7シナリオ以上） |
| Pod 別計測値が CSV に記録されていること | `results_pods.csv` に全 Pod 分の行があること |
| ピーク値が `summary.md` に明記されていること | v1.3.1 への引き継ぎ値として記載 |
| `v1.2.1-stable` スナップショットが保存されていること | `vagrant snapshot list` |
| CSV が git にコミットされていること | `git log --oneline -1` |

---

## 作業メモ欄

- 開始日:
- 完了日:
- 注記:
  - Vagrantfile の `vb.memory` 更新は **v1.3.1 で実施**（監視スタック込みの最終ピークが出てから）
  - 計測結果 CSV は v1.3.1 でも参照するため、フォーマットを統一しておくこと
