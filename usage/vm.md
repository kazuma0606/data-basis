# VM 操作マニュアル

---

## 前提

すべての `vagrant` コマンドは `infrastructure/vagrant/production/` で実行する。

```bash
cd infrastructure/vagrant/production
```

---

## 基本操作

### 起動

```bash
vagrant up
```

初回は Ubuntu box のダウンロードと k3s のインストールが走る（10〜20分）。
2回目以降は数秒〜1分で起動する。

起動後に全 Pod が Running になるまで約1〜2分かかる。

```bash
# Pod が全部 Running になったか確認
vagrant ssh -c "kubectl get pods -n technomart"
```

### 停止

```bash
vagrant halt
```

Pod は k8s が graceful shutdown する。次回 `vagrant up` すると自動復旧する。

### 再起動

```bash
vagrant reload
```

Vagrantfile の変更（CPU/メモリ設定など）を反映したいときも使う。
再起動後、全 Pod が復旧するまで約2分。

### VM に SSH ログイン

```bash
vagrant ssh
```

プロンプトが `vagrant@technomart:~$` に変わる。
VM 内では `/technomart/` がリポジトリルートにマウントされている。

```bash
# リポジトリのルートに移動（VM内）
cd /technomart
```

### VM 状態確認

```bash
vagrant status
```

| ステータス | 意味 |
|---|---|
| `running` | 起動中 |
| `poweroff` | 停止中 |
| `aborted` | 異常終了（guru meditation 後など） |
| `not created` | まだ `vagrant up` していない |

---

## スナップショット

VM 全体の状態をファイルとして保存し、いつでも復元できる。
k8s クラスターの状態（Pod・PVC・レジストリ内イメージ）ごと保存される。

### 保存

```bash
vagrant snapshot save "v1.1-stable"
```

命名規則: `{バージョン}-stable` または `{バージョン}-{日付}`

### 一覧表示

```bash
vagrant snapshot list
```

現状:
```
v1.0-stable   # フェーズ0完了時点（全 Pod Running 確認済み）
v1.1-stable   # フェーズ8完了時点（Fluent Bit / toolbox / レジストリ含む）
```

### 復元

```bash
vagrant snapshot restore "v1.1-stable"
```

> **注意**: 復元すると現在の VM 状態は失われる。
> 復元後に `vagrant ssh -c "kubectl get pods -n technomart"` で全 Pod が Running になるか確認する。

### 削除

```bash
vagrant snapshot delete "v1.0-stable"
```

スナップショットはディスクを消費するため、不要になったものは削除してよい。

---

## ディスク使用量の確認

VM のルートディスクは 200GB で作成されているが、
LVM の論理ボリュームは小さく割り当てられている場合がある。

```bash
vagrant ssh -c "df -h /"
```

v1.1 現在の使用状況:
```
Filesystem                         Size  Used Avail Use% Mounted on
/dev/mapper/ubuntu--vg-ubuntu--lv   31G   25G  4.1G  87% /
```

残り 4GB を切ったら不要な Docker イメージを削除する:

```bash
# VM内で実行
docker image prune -a
# 使用中のイメージは削除されないので安全
```

---

## トラブル対応

### VM が `aborted` 状態になった（guru meditation）

VirtualBox の内部エラーで VM が異常終了した場合。

```bash
# ホスト側（PowerShell または bash）で実行
"/c/Program Files/Oracle/VirtualBox/VBoxManage.exe" controlvm "technomart-ubuntu" poweroff
# または
"C:\Program Files\Oracle\VirtualBox\VBoxManage.exe" controlvm "technomart-ubuntu" poweroff

# 数秒待って aborted になったことを確認してから起動
vagrant up
```

起動後に Unknown / Terminating で止まっている Pod があれば強制削除:

```bash
vagrant ssh -c "kubectl get pods -n technomart"
# Unknown や Terminating があれば:
vagrant ssh -c "kubectl delete pod <pod-name> -n technomart --force --grace-period=0"
```

### `vagrant up` で "machine already locked for a session" エラー

VM が中途半端な状態でロックされている。

```bash
# VBoxManage で強制終了
"/c/Program Files/Oracle/VirtualBox/VBoxManage.exe" controlvm "technomart-ubuntu" poweroff
# しばらく待ってから
vagrant up
```

### VM 起動後に Pod が `ErrImagePull` / `ImagePullBackOff`

レジストリ Pod の起動よりも他の Pod の起動が先行すると一時的に発生する。
k8s の backoff retry で約2分以内に自動解消する。

```bash
# 状態を watch して自動復旧を確認
vagrant ssh -c "watch kubectl get pods -n technomart"
```

2分経っても解消しない場合はレジストリの状態を確認:

```bash
vagrant ssh -c "kubectl get pod -l app=registry -n technomart"
vagrant ssh -c "curl -s http://192.168.56.10:32500/v2/_catalog"
```

### SSH 接続が拒否される

```bash
# vagrant の SSH config を確認
vagrant ssh-config

# 直接 SSH する場合
ssh -i .vagrant/machines/default/virtualbox/private_key \
    -o StrictHostKeyChecking=no \
    -p 2222 vagrant@127.0.0.1
```

### `vagrant reload` 後に k3s が起動しない

```bash
vagrant ssh -c "sudo systemctl status k3s"
vagrant ssh -c "sudo systemctl start k3s"
```

k3s は systemd で `enabled` 設定済みなので基本的に自動起動するが、
起動に時間がかかることがある（30秒〜1分）。

---

## VM 仕様

| 項目 | 値 |
|---|---|
| Box | bento/ubuntu-24.04 |
| IP | 192.168.56.10 (Host-Only) |
| CPU | 10コア |
| RAM | 48GB |
| ディスク | 200GB (VirtualBox) / LVM 31GB |
| k3s | v1.34.5+k3s1 |
| マウントポイント | `/technomart` = リポジトリルート |
| SSH ユーザー | vagrant |
| SSH 鍵 | `.vagrant/machines/default/virtualbox/private_key` |
