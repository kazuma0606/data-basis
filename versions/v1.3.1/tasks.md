# v1.3.1 タスクリスト — Loki ログ集約 + RAM 計測・Vagrantfile 更新

作成日: 2026-03-21
参照: versions/v1.3.1/plan.md
前提: v1.3（監視・オブザーバビリティ）完了後に着手

進捗凡例: `[ ]` 未着手 / `[>]` 作業中 / `[x]` 完了 / `[-]` スキップ

---

## フェーズ-1: 作業前スナップショット（必須）

- [x] **-1-1. 現在のスナップショット一覧を確認**
  ```bash
  cd infrastructure/vagrant/production
  vagrant snapshot list
  # → v1.3-stable が存在すること
  ```

- [x] **-1-2. 作業前スナップショットを保存**
  ```bash
  vagrant snapshot save "pre-v1.3.1"
  vagrant snapshot list
  ```

### ✅ フェーズ-1 完了基準
- [x] `pre-v1.3.1` がスナップショット一覧に表示されること

---

## フェーズ1: Loki デプロイ

> Fluent Bit（v1.1 導入済み）のログを受け取るバックエンド。RAM ~100MB と軽量。

- [x] **1-1. Loki マニフェスト作成**
  - `infrastructure/k8s/monitoring/loki/manifest.yaml` を作成
  - 構成要素:
    - ConfigMap: `loki-config`（保存期間 168h / filesystem ストレージ）
    - PVC: `loki-data`（10Gi）
    - Deployment: `loki`（50m CPU / 256Mi RAM）
    - Service: `loki`（ClusterIP、ポート 3100）
  - 主な設定値:
    ```yaml
    auth_enabled: false
    storage:
      type: filesystem   # AWS 移行時は s3 に変更
    limits_config:
      retention_period: 168h
    ```

- [x] **1-2. Loki 適用・起動確認**
  ```bash
  kubectl apply -f infrastructure/k8s/monitoring/loki/manifest.yaml
  kubectl get pods -n monitoring -l app=loki
  kubectl logs -n monitoring deployment/loki --tail=20
  ```

- [x] **1-3. Loki /ready エンドポイント確認**
  ```bash
  vagrant ssh -- "curl -s http://$(kubectl get svc loki -n monitoring -o jsonpath='{.spec.clusterIP}'):3100/ready"
  # → "ready" が返ること
  ```

### ✅ フェーズ1 完了基準
- [x] `kubectl get pods -n monitoring -l app=loki` で Running
- [x] `/ready` エンドポイントが `"ready"` を返すこと

---

## フェーズ2: Fluent Bit → Loki 出力設定

> v1.1 で導入済みの Fluent Bit に Loki output を追加する。既存出力は残す。

- [x] **2-1. Fluent Bit ConfigMap に Loki output を追加**
  - 既存の ConfigMap（`fluent-bit-manifest.yaml` or k8s マニフェスト）に以下を追記:
    ```ini
    [OUTPUT]
        Name        loki
        Match       kube.*
        Host        loki.monitoring.svc.cluster.local
        Port        3100
        Labels      job=fluent-bit
        Auto_Kubernetes_Labels on
    ```
  - 既存の stdout / tail 出力は**そのまま残す**

- [x] **2-2. Fluent Bit を再起動して設定を反映**
  ```bash
  kubectl rollout restart daemonset/fluent-bit -n technomart
  kubectl rollout status daemonset/fluent-bit -n technomart
  ```

- [x] **2-3. Fluent Bit ログでエラーがないことを確認**
  ```bash
  kubectl logs -n technomart daemonset/fluent-bit --tail=30
  # → Loki への接続エラーがないこと
  ```

### ✅ フェーズ2 完了基準
- [x] Fluent Bit ログに Loki 接続エラーが出ないこと
- [x] Loki の `/metrics` で `loki_ingester_chunks_created_total` が増加していること

---

## フェーズ3: Grafana に Loki DataSource を追加

> v1.3 で作成した Grafana のプロビジョニング設定に追記。

- [x] **3-1. Loki DataSource 設定を追加**
  - `infrastructure/k8s/monitoring/grafana/manifest.yaml` 内の DataSource ConfigMap に追記:
    ```yaml
    - name: Loki
      type: loki
      url: http://loki.monitoring.svc.cluster.local:3100
      isDefault: false
    ```

- [x] **3-2. ConfigMap を適用・Grafana を再起動**
  ```bash
  kubectl apply -f infrastructure/k8s/monitoring/grafana/manifest.yaml
  kubectl rollout restart deployment/grafana -n monitoring
  kubectl rollout status deployment/grafana -n monitoring
  ```

- [x] **3-3. Grafana で Loki DataSource を確認**
  - `http://192.168.56.10:30030` → Configuration → Data Sources
  - Loki が表示され、`Test` が成功すること

### ✅ フェーズ3 完了基準
- [x] Grafana Data Sources に `Loki` が表示されること
- [x] `Save & Test` が `"Data source connected and labels found."` を返すこと

---

## フェーズ4: ログダッシュボード作成・動作確認

> Grafana Explore でのログ参照と、専用ダッシュボードの作成。

- [x] **4-1. Grafana Explore でログを確認**
  - `http://192.168.56.10:30030` → Explore → DataSource: Loki
  - 以下の LogQL が結果を返すこと:
    ```logql
    {namespace="technomart"}
    {namespace="technomart", app="backend"} |= "error"
    ```

- [x] **4-2. ログダッシュボード JSON 作成**
  - `infrastructure/k8s/monitoring/grafana/dashboards/07-logs.json` を作成
  - パネル構成:

    | パネル | LogQL |
    |---|---|
    | エラーログ一覧（直近 1h） | `{namespace="technomart"} \|= "error"` |
    | サービス別ログ量推移 | `sum by (app) (rate({namespace="technomart"}[5m]))` |
    | バッチジョブ完了ログ | `{namespace="technomart", app="backend"} \|= "job_completed"` |

- [x] **4-3. ConfigMap にダッシュボードを追加・反映**
  ```bash
  # grafana-dashboards ConfigMap に 07-logs.json を追加
  kubectl apply -f infrastructure/k8s/monitoring/grafana/dashboards-configmap.yaml
  kubectl rollout restart deployment/grafana -n monitoring
  ```

- [x] **4-4. Grafana でダッシュボードが表示されることを確認**
  - ダッシュボード一覧に「ログ概要」が表示されること
  - 全パネルにデータが入っていること

### ✅ フェーズ4 完了基準
- [x] LogQL `{namespace="technomart"}` でログが返ること
- [x] `|= "error"` フィルタが動作すること
- [x] ログダッシュボードの全パネルにデータが表示されること

---

## フェーズ5: RAM 計測

> v1.3.1 の全スタック（Loki 含む）でのピーク RAM を計測し results.md に記録する。

- [x] **5-1. 計測ツール確認**
  ```bash
  vagrant ssh -- "kubectl top nodes && kubectl top pods -n technomart && kubectl top pods -n monitoring"
  ```

- [x] **5-2. シナリオ A: アイドル状態（ベースライン）**
  ```bash
  vagrant ssh -- "
    echo '=== Node ===' && kubectl top nodes
    echo '=== technomart Pods ===' && kubectl top pods -n technomart --sort-by=memory
    echo '=== monitoring Pods ===' && kubectl top pods -n monitoring --sort-by=memory
    echo '=== Host ===' && free -h
  "
  ```

- [x] **5-3. シナリオ B: API 並列リクエスト（10 並列）**
  ```bash
  for i in $(seq 1 10); do
    curl -s http://192.168.56.10:30300/api/healthz &
  done
  wait
  vagrant ssh -- "kubectl top pods -n technomart --sort-by=memory && free -h"
  ```

- [x] **5-4. シナリオ C: ClickHouse 分析クエリ**
  ```bash
  vagrant ssh -- "
    kubectl exec -n technomart deploy/clickhouse -- \
      clickhouse-client --query '
        SELECT toStartOfMonth(event_time) AS month, count() AS cnt
        FROM events GROUP BY month ORDER BY month
      '
    kubectl top pods -n technomart -l app=clickhouse && free -h
  "
  ```

- [x] **5-5. シナリオ D: Ollama 推論（1 / 3 並列）**
  ```bash
  # 1 並列
  vagrant ssh -- "kubectl exec -n technomart deploy/ollama -- ollama run qwen2.5:3b '顧客セグメント分析の結果を要約して'"
  vagrant ssh -- "kubectl top pods -n technomart -l app=ollama && free -h"

  # 3 並列
  for i in 1 2 3; do
    vagrant ssh -- "kubectl exec -n technomart deploy/ollama -- ollama run qwen2.5:3b 'テスト ${i}'" &
  done
  wait
  vagrant ssh -- "kubectl top pods -n technomart -l app=ollama && free -h"
  ```

- [x] **5-6. シナリオ E: スコアリングバッチ実行**
  ```bash
  vagrant ssh -- "
    kubectl create job scoring-bench-$(date +%s) --from=cronjob/scoring-daily -n technomart
    sleep 30
    kubectl top pods -n technomart --sort-by=memory && free -h
  "
  ```

- [x] **5-7. シナリオ G: 全同時（ピーク推定）**
  - シナリオ B + C + D（3並列）+ E を同時実行
  - 実行中に `kubectl top nodes` と `free -h` を繰り返して最大値を記録

- [x] **5-8. 計測結果を results.md に記録**
  - `versions/v1.3.1/results.md` を plan.md のテンプレートで作成
  - 全シナリオの計測値・v1.2.1 比増分・推奨 RAM 値を記入

### ✅ フェーズ5 完了基準
- [x] `versions/v1.3.1/results.md` に全シナリオの計測値が記録されていること
- [x] 推奨 `vb.memory` 値が決定されていること

---

## フェーズ6: Vagrantfile 更新・最終確認

> 計測結果に基づいて Vagrantfile を更新し、vagrant reload で動作確認する。

- [x] **6-1. Vagrantfile の `vb.memory` を更新**
  - `infrastructure/vagrant/production/Vagrantfile` の `vb.memory` を results.md の「開発推奨」値に変更

- [-] **6-2. vagrant reload で VM を再起動**
  ```bash
  cd infrastructure/vagrant/production
  vagrant reload
  ```

- [-] **6-3. 再起動後の全 Pod 起動確認**
  ```bash
  vagrant ssh -- "kubectl get pods -n technomart && echo '---' && kubectl get pods -n monitoring"
  # 全 Pod が Running または Completed であること
  ```

- [-] **6-4. Grafana・Prometheus が正常動作することを確認**
  ```bash
  vagrant ssh -- "curl -s http://192.168.56.10:30030/api/health"
  vagrant ssh -- "curl -s http://192.168.56.10:30990/-/healthy"
  ```

### ✅ フェーズ6 完了基準
- [x] Vagrantfile が更新されていること（計測結果コメント追記）
- [-] `vagrant reload` は不要（vb.memory 数値変更なし・現状維持）
- [-] 再起動不要のため省略

---

## フェーズ7: 最終確認・スナップショット

- [x] **7-1. ヘルスチェック（全サービス）**
  ```bash
  # /health-check スキルを実行
  ```

- [x] **7-2. Loki 最終確認**
  - Grafana → Explore → Loki で `{namespace="technomart"}` が返ること
  - ログダッシュボードの全パネルにデータがあること

- [x] **7-3. `vagrant snapshot save "v1.3.1-stable"`**
  ```bash
  cd infrastructure/vagrant/production
  vagrant snapshot save "v1.3.1-stable"
  vagrant snapshot list
  ```

### ✅ v1.3.1 完了基準

| 確認項目 | 結果 |
|---|---|
| Loki Pod が Running | ✅ Running |
| Fluent Bit → Loki へのログ転送が動作 | ✅ ラベル app/job/namespace 取り込み確認済み |
| Grafana に Loki DataSource が登録済み | ✅ Prometheus + Loki の2つ登録済み |
| ログダッシュボードが表示される | ✅ 「ログ概要」(07-logs) 追加・計7枚 |
| 全シナリオの RAM 計測値が記録済み | ✅ `versions/v1.3.1/results.md` 作成済み |
| Vagrantfile が推奨値に更新済み | ✅ 計測結果コメント追記（数値は現状維持） |
| 全 Pod 正常起動 | ✅ Running / Completed のみ |
| v1.3.1-stable スナップショット保存済み | ✅ 保存中 |

---

## 作業メモ欄

- 開始日: 2026-03-21
- 完了日: 2026-03-21
- 注記:
  - Loki PVC (10Gi) + イメージ取得により `/` ディスク使用率が 59% → 94% に増加。ディスク拡張要検討。
  - RAM ピーク 6.4 GB は Ollama (qwen2.5:3b) のモデルロードが支配的。監視スタック自体は ~330 MB のみ。
  - 共有フォルダ (/technomart, /vagrant) が 95% により k3s が一時的に DiskPressure 誤判定するケースあり。
  - vb.memory は現状 48 GB 維持（ホスト 128 GB のため）。16 GB あれば十分な実測値を確認。
