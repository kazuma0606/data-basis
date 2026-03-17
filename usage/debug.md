# デバッグ・障害対応

---

## 基本的な状態確認コマンド

```bash
# 全 Pod の状態
vagrant ssh -c "kubectl get pods -n technomart"
vagrant ssh -c "kubectl get pods -n technomart -o wide"  # Node・IP も表示

# Pod のイベント・詳細（エラーの原因がここに出ることが多い）
vagrant ssh -c "kubectl describe pod <pod-name> -n technomart"

# Pod のログ
vagrant ssh -c "kubectl logs -n technomart -l app=backend --tail=50"
vagrant ssh -c "kubectl logs -n technomart -l app=frontend --tail=50"

# 直前のクラッシュログ
vagrant ssh -c "kubectl logs -n technomart <pod-name> --previous"

# Node の状態
vagrant ssh -c "kubectl describe node technomart"

# PVC の状態
vagrant ssh -c "kubectl get pvc -n technomart"
```

---

## よくある障害パターン

### CrashLoopBackOff

Pod が起動して即クラッシュを繰り返している状態。

```bash
# 1. ログを確認
vagrant ssh -c "kubectl logs -n technomart -l app=<service-name> --previous"

# 2. 詳細を確認
vagrant ssh -c "kubectl describe pod -l app=<service-name> -n technomart"
```

**よくある原因と対処**:

| 原因 | 対処 |
|---|---|
| 依存サービス（DB 等）がまだ起動していない | しばらく待つ。readinessProbe が通れば自動復旧 |
| 環境変数・Secret が欠けている | `kubectl describe pod` の `Environment` 欄を確認 |
| アプリのバグ | ログのスタックトレースを確認して修正・再デプロイ |
| メモリ不足 (OOMKilled) | `kubectl describe pod` に `OOMKilled` が出る。limits を上げるか Ollama 等を停止 |

---

### ImagePullBackOff / ErrImagePull

```bash
vagrant ssh -c "kubectl describe pod <pod-name> -n technomart | grep -A 10 Events"
```

**よくある原因と対処**:

| 原因 | 対処 |
|---|---|
| レジストリが起動していない | `kubectl get pod -l app=registry -n technomart` でレジストリ Pod を確認 |
| イメージ名・タグの typo | `curl -s http://192.168.56.10:32500/v2/<name>/tags/list` でタグを確認 |
| VM 起動直後でレジストリが間に合っていない | 2分待てば自動復旧（k8s の backoff retry） |

手動で Pod を再起動して pull をリトライさせる:

```bash
vagrant ssh -c "kubectl delete pod <pod-name> -n technomart"
# Deployment は自動で新しい Pod を作成する
```

---

### Pending のまま起動しない

```bash
vagrant ssh -c "kubectl describe pod <pod-name> -n technomart | grep -A 5 'Events:'"
```

**よくある原因と対処**:

| 原因 | 対処 |
|---|---|
| リソース不足（CPU/メモリ） | `kubectl describe node` で `Allocatable` と `Requests` を確認 |
| PVC の作成に失敗 | `kubectl get pvc -n technomart` で Bound になっているか確認 |
| Node が NotReady | `kubectl get nodes` で確認、k3s を再起動 |

---

### Pod が Running だがサービスが応答しない

```bash
# toolbox から内部 DNS で直接叩く
kubectl exec -it toolbox -n technomart -- bash
curl -s http://backend.technomart.svc.cluster.local:8000/healthz

# Service の設定を確認
vagrant ssh -c "kubectl get svc -n technomart"
vagrant ssh -c "kubectl describe svc backend -n technomart"

# Endpoints が存在するか確認
vagrant ssh -c "kubectl get endpoints -n technomart"
```

---

### LocalStack の S3 バケットが消えた

LocalStack は Pod が再起動するとデータが初期化される（インメモリ）。

```bash
# バケットを再作成
kubectl exec -it toolbox -n technomart -- bash
awslocal s3 mb s3://technomart-datalake

# もしくは deploy.sh の [5/8] ステップが自動作成するので再デプロイでも OK
```

---

### Fluent Bit が S3 に書き込めない

```bash
# Fluent Bit のログ確認
vagrant ssh -c "kubectl logs -l app=fluent-bit -n technomart --tail=30"

# S3 バケットが存在するか確認
kubectl exec -it toolbox -n technomart -- awslocal s3 ls

# バケットがなければ作成
kubectl exec -it toolbox -n technomart -- awslocal s3 mb s3://technomart-datalake

# Fluent Bit を再起動
vagrant ssh -c "kubectl rollout restart daemonset/fluent-bit -n technomart"
```

---

### Kafka に接続できない

```bash
# Kafka Pod の状態確認
vagrant ssh -c "kubectl get pod kafka-0 -n technomart"

# Kafka のログ
vagrant ssh -c "kubectl logs kafka-0 -n technomart --tail=30"

# toolbox から疎通確認
kubectl exec -it toolbox -n technomart -- bash
kcat -b kafka.technomart.svc.cluster.local:9092 -L

# Kafka Pod を再起動（StatefulSet は pod 名を指定して削除）
vagrant ssh -c "kubectl delete pod kafka-0 -n technomart"
# StatefulSet が自動で再作成する
```

---

### ディスクが枯渇した（87% 以上）

```bash
vagrant ssh -c "df -h /"

# 未使用 Docker イメージを削除（使用中イメージは保護される）
vagrant ssh -c "docker image prune -a"

# k3s のイメージキャッシュも確認
vagrant ssh -c "sudo k3s ctr images ls | wc -l"
vagrant ssh -c "sudo k3s ctr images prune --all 2>/dev/null || true"

# ログファイルの整理
vagrant ssh -c "sudo journalctl --vacuum-size=500M"
```

---

### VM が起動しない（guru meditation）

→ [vm.md](vm.md) の「VM が aborted 状態になった」を参照。

---

## ログの探し方

### k8s ログ（リアルタイム）

```bash
# backend のログをリアルタイムで見る
vagrant ssh -c "kubectl logs -f -l app=backend -n technomart"

# 複数 Pod のログを同時に見る（stern が入っている場合）
vagrant ssh -c "stern -n technomart backend"
```

### S3 に蓄積されたログ（Fluent Bit 経由）

Pod が再起動・削除された後のログはここにある。

```bash
kubectl exec -it toolbox -n technomart -- bash

# 日付ごとのファイル一覧
awslocal s3 ls s3://technomart-datalake/logs/2026/03/17/ | grep backend

# ダウンロードして中身を見る（gzip 圧縮）
awslocal s3 cp s3://technomart-datalake/logs/2026/03/17/<filename> /tmp/log.gz
zcat /tmp/log.gz
```

### 直前のクラッシュログ

```bash
vagrant ssh -c "kubectl logs -n technomart <pod-name> --previous"
```

---

## 完全リセット手順

全データを消してゼロから構築し直す場合。

```bash
# 1. スナップショットがあれば使う（推奨）
vagrant snapshot restore "v1.1-stable"

# 2. スナップショットがない・完全リセットしたい場合
vagrant ssh
/technomart/infrastructure/scripts/teardown.sh   # Namespace 削除
/technomart/infrastructure/scripts/deploy.sh     # 再デプロイ
/technomart/infrastructure/scripts/initial_data.sh  # データ再投入

# 3. 最終手段：VM を作り直す
vagrant destroy
vagrant up
# 再デプロイ・データ投入
```

---

## パフォーマンス確認

```bash
# リソース使用量（Pod 別）
vagrant ssh -c "kubectl top pods -n technomart"

# Node のリソース使用量
vagrant ssh -c "kubectl top node"

# メモリ使用量の内訳（VM 内）
vagrant ssh -c "free -h"

# ディスク I/O
vagrant ssh -c "iostat -x 1 5"
```

Ollama が多くのメモリを消費するため、モデル推論が走ると他サービスが圧迫されることがある。
`qwen2.5:3b` は約2GB、`nomic-embed-text` は約400MB 使用する。
