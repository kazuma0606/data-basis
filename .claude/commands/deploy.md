# /deploy — コンポーネントのビルド・デプロイ

引数で指定したコンポーネントを Docker ビルド → レジストリ push → kubectl rollout の順でデプロイする。

**対象コンポーネント:** $ARGUMENTS

## 手順

以下を vagrant ssh 経由で実行すること。ホスト上で直接 docker/kubectl は使わない。

### 1. コンポーネントの解決

引数 `$ARGUMENTS` を確認し、以下のマッピングで情報を決定する：

| 引数 | ソースディレクトリ | イメージ名 | namespace | Deployment名 |
|---|---|---|---|---|
| `backend` | `/technomart/application/backend` | `technomart-backend` | `technomart` | `backend` |
| `frontend` | `/technomart/application/frontend` | `technomart-frontend` | `technomart` | `frontend` |

引数が上記以外の場合はユーザーに確認する。

### 2. ビルド

```bash
vagrant ssh -- "cd <ソースディレクトリ> && docker build -t 192.168.56.10:32500/<イメージ名>:latest . 2>&1 | tail -5"
```

`Successfully built` が出ることを確認する。失敗した場合はエラー全文を表示してユーザーに報告し、以降の手順を中断する。

### 3. Push

```bash
vagrant ssh -- "docker push 192.168.56.10:32500/<イメージ名>:latest 2>&1 | tail -5"
```

### 4. Rollout

```bash
vagrant ssh -- "kubectl rollout restart deployment/<Deployment名> -n <namespace> && kubectl rollout status deployment/<Deployment名> -n <namespace> --timeout=120s"
```

`successfully rolled out` が出ることを確認する。失敗（タイムアウト）した場合は以下を実行してログを取得し、ユーザーに報告する：

```bash
vagrant ssh -- "kubectl get pods -n <namespace> | grep <Deployment名> && kubectl describe pod -n <namespace> -l app=<Deployment名> | grep -A10 'Events:'"
```

### 5. 動作確認

Pod IP を取得して `/healthz` を叩く：

```bash
vagrant ssh -- "POD_IP=\$(kubectl get pod -n <namespace> -l app=<Deployment名> -o jsonpath='{.items[0].status.podIP}') && echo \$POD_IP && curl -s http://\$POD_IP:8000/healthz"
```

`{"status":"ok"}` が返ることを確認する。

### 6. 結果報告

以下の形式で結果を報告する：

```
✅ <コンポーネント> デプロイ完了
  イメージ: 192.168.56.10:32500/<イメージ名>:latest
  Pod: <pod名> (Running)
  ヘルスチェック: ok
```
