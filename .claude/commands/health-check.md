# /health-check — 全サービスの健全性確認

monitoring・technomart 両 namespace のPod状態、Prometheusターゲット、Grafana死活を一括確認する。

## 手順

以下を順番に実行し、結果を整形して報告する。

### 1. Pod 状態確認

```bash
vagrant ssh -- "kubectl get pods -n monitoring && echo '---' && kubectl get pods -n technomart"
```

Running / Completed 以外のPodがあれば ⚠️ でハイライトする。

### 2. Prometheus ターゲット確認

```bash
vagrant ssh -- "curl -s http://192.168.56.10:30990/api/v1/targets 2>&1 | python3 -c \"import sys,json; d=json.load(sys.stdin); [print(t['labels'].get('job','?'), t['health'], t.get('lastError','')[:80]) for t in d['data']['activeTargets']]\""
```

`up` 以外のターゲットがあれば ⚠️ でハイライトする。

### 3. Grafana 死活確認

```bash
vagrant ssh -- "curl -s http://192.168.56.10:30030/api/health"
```

`"database":"ok"` が含まれることを確認する。

### 4. 結果レポート

以下の形式でまとめて報告する：

```
## ヘルスチェック結果 (<実行日時>)

### Pods — monitoring (<Running数>/<総数>)
  ✅ prometheus           Running
  ✅ grafana              Running
  ...（異常があれば ⚠️）

### Pods — technomart (<Running数>/<総数>)
  ✅ backend              Running
  ✅ frontend             Running
  ...（異常があれば ⚠️）

### Prometheus ターゲット (<UP数>/<総数>)
  ✅ backend              up
  ✅ clickhouse-exporter  up
  ...（DOWN があれば ⚠️ とエラー内容）

### Grafana
  ✅ ok (v11.4.0)

### 総合判定
  ✅ 全サービス正常  /  ⚠️ <N> 件の異常あり（要確認）
```

異常があった場合はその Pod のログを自動取得してレポートに追記する：

```bash
vagrant ssh -- "kubectl logs -n <namespace> <pod名> --tail=20"
```
