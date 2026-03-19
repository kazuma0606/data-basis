# v1.2g タスクリスト — CI/CD 基盤整備

作成日: 2026-03-19
参照: v1.2g/plan.md
位置づけ: v1.2.1 着手前の前提作業

進捗凡例: `[ ]` 未着手 / `[>]` 作業中 / `[x]` 完了 / `[-]` スキップ

---

## フェーズ-1: 作業前スナップショット（必須）

- [ ] **-1-1. 現在のスナップショット一覧を確認**
  ```bash
  cd infrastructure/vagrant/production
  vagrant snapshot list
  # → v1.2-stable が存在すること
  ```

- [ ] **-1-2. 作業前スナップショットを保存**
  ```bash
  vagrant snapshot save "pre-v1.2g"
  vagrant snapshot list
  ```

### ✅ フェーズ-1 完了基準
- [ ] `pre-v1.2g` がスナップショット一覧に表示されること

---

## フェーズ0: 即時セキュリティ修正（TLS 秘密鍵）

> GitGuardian が検出した `infrastructure/k8s/ingress/tls.key` の除外。
> 自己署名鍵のため実害はないが、パターンとして残してはいけない。

- [ ] **0-1. .gitignore に TLS ファイルを追加**
  ```
  # 追加する行（infrastructure/k8s/ingress/ 配下の証明書・鍵）
  infrastructure/k8s/ingress/*.key
  infrastructure/k8s/ingress/*.crt
  ```

- [ ] **0-2. git の追跡から除外**
  ```bash
  git rm --cached infrastructure/k8s/ingress/tls.key
  git rm --cached infrastructure/k8s/ingress/tls.crt 2>/dev/null || true
  ```
  - ファイル自体は削除しない（VM で使用中）

- [ ] **0-3. commit & push**
  ```bash
  git add .gitignore
  git commit -m "security: Remove TLS private key from git tracking"
  git push
  ```

- [ ] **0-4. GitGuardian 上で「This secret is revoked」を報告**
  - 自己署名鍵のため実際の revoke は不要
  - GitGuardian の UI から「Resolve」または「Won't fix」でクローズ

### ✅ フェーズ0 完了基準
- [ ] `git ls-files infrastructure/k8s/ingress/` に `tls.key` が表示されないこと
- [ ] `tls.key` ファイル自体は VM のファイルシステムに残存していること

---

## フェーズ1: シークレットスキャン（gitleaks）

> 最優先。push のたびに全ブランチを検査し、秘密鍵・APIキーを含む commit をブロックする。

- [ ] **1-1. .gitleaks.toml の作成（false positive 除外リスト）**
  ```toml
  # .gitleaks.toml（リポジトリルート）
  # LocalStack・開発用のダミー値を除外
  [allowlist]
    description = "Known dummy values for local development"
    regexes = [
      # LocalStack / Terraform の固定値
      '''access_key\s*=\s*["']test["']''',
      '''secret_key\s*=\s*["']test["']''',
      # k8s manifest / Python config のデフォルト値
      '''AWS_ACCESS_KEY_ID.*test''',
      '''AWS_SECRET_ACCESS_KEY.*test''',
      '''aws_access_key_id.*=.*"test"''',
      '''aws_secret_access_key.*=.*"test"''',
    ]
  ```

- [ ] **1-2. .github/workflows/secret-scan.yml の作成**
  ```yaml
  name: Secret Scan
  on:
    push:
      branches: ["**"]    # 全ブランチ対象
  jobs:
    gitleaks:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
          with:
            fetch-depth: 0         # 全履歴を取得（差分スキャン用）
        - uses: gitleaks/gitleaks-action@v2
          env:
            GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
            GITLEAKS_LICENSE: ${{ secrets.GITLEAKS_LICENSE }}  # 不要なら省略可
  ```
  - `GITLEAKS_LICENSE` は OSS 版では不要

- [ ] **1-3. 動作確認**
  - push して GitHub Actions タブで green を確認
  - テスト: ダミーの秘密鍵をブランチに commit → ブロックされることを確認（後で revert）

### ✅ フェーズ1 完了基準
- [ ] push のたびに gitleaks が実行されること
- [ ] 既存コードの全スキャンが green（または .gitleaks.toml で適切に除外）であること

---

## フェーズ2: Python コード品質 CI（ruff + mypy）

> `pyproject.toml` に既存設定あり。CI に接続するだけ。

- [ ] **2-1. ローカルで mypy baseline を確認**
  ```bash
  cd application/backend
  uv run mypy app/
  # エラー数を記録する。多い場合はフェーズ2-2 で対処
  ```

- [ ] **2-2. mypy エラー対処（baseline 確認後）**
  - エラーが 0〜10 件程度 → すべて修正
  - エラーが多い場合 → `pyproject.toml` に `ignore_errors = true` の対象モジュールを限定指定し、段階的に修正
  - ゼロにしてから CI に組み込む

- [ ] **2-3. .github/workflows/ci-backend.yml の作成**
  ```yaml
  name: Backend CI
  on:
    push:
      branches: ["v*.x_development", "master"]
    pull_request:
      branches: ["master"]
  jobs:
    lint:
      runs-on: ubuntu-latest
      defaults:
        run:
          working-directory: application/backend
      steps:
        - uses: actions/checkout@v4
        - uses: astral-sh/setup-uv@v5
          with:
            version: "0.5"
        - run: uv sync --group dev
        - name: ruff lint
          run: uv run ruff check app/
        - name: ruff format check
          run: uv run ruff format --check app/
        - name: mypy
          run: uv run mypy app/
  ```

### ✅ フェーズ2 完了基準
- [ ] ruff・mypy が GitHub Actions で green になること
- [ ] `ruff check app/` がローカルでもエラーなしであること

---

## フェーズ3: TypeScript / Next.js コード品質 CI（eslint + tsc）

> `package.json` に `"lint": "eslint ."` が定義済み。TypeScript も devDependencies に存在。

- [ ] **3-1. ローカルで tsc baseline を確認**
  ```bash
  cd application/frontend
  npx tsc --noEmit
  # エラーがあれば修正してから CI に組み込む
  ```

- [ ] **3-2. eslint baseline を確認**
  ```bash
  npm run lint
  ```

- [ ] **3-3. エラー対処**
  - tsc / eslint のエラーをすべて修正してから次へ進む

- [ ] **3-4. .github/workflows/ci-frontend.yml の作成**
  ```yaml
  name: Frontend CI
  on:
    push:
      branches: ["v*.x_development", "master"]
    pull_request:
      branches: ["master"]
  jobs:
    lint:
      runs-on: ubuntu-latest
      defaults:
        run:
          working-directory: application/frontend
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with:
            node-version: "22"
            cache: "npm"
            cache-dependency-path: application/frontend/package-lock.json
        - run: npm ci --ignore-scripts
        - name: TypeScript type check
          run: npx tsc --noEmit
        - name: ESLint
          run: npm run lint
  ```

### ✅ フェーズ3 完了基準
- [ ] tsc + eslint が GitHub Actions で green になること
- [ ] ローカルでも `npm run lint` と `npx tsc --noEmit` がエラーなしであること

---

## フェーズ4: pre-commit フック（ローカル二重防御）

> ローカルの commit 前に gitleaks を実行し、GitHub に届く前にブロックする。

- [ ] **4-1. .pre-commit-config.yaml の作成（リポジトリルート）**
  ```yaml
  repos:
    - repo: https://github.com/gitleaks/gitleaks
      rev: v8.21.2
      hooks:
        - id: gitleaks
  ```

- [ ] **4-2. ホストマシンへの pre-commit インストール案内**
  ```bash
  # Windows (PowerShell)
  pip install pre-commit
  # または
  winget install pre-commit

  # フック有効化（リポジトリルートで）
  pre-commit install

  # 動作確認
  pre-commit run --all-files
  ```
  - VM 内ではなくホストマシン（Windows 側）でインストールする

- [ ] **4-3. README.md または CLAUDE.md への手順追記**
  - 新規参加者が pre-commit を設定できるよう記載

### ✅ フェーズ4 完了基準
- [ ] `git commit` 時に gitleaks が自動実行されること
- [ ] 秘密鍵を含むファイルを commit しようとするとブロックされること

---

## フェーズ5: 最終確認

- [ ] **5-1. 全ワークフローの green 確認**
  - GitHub → Actions タブで secret-scan / ci-backend / ci-frontend が全て ✓

- [ ] **5-2. .gitignore 追加漏れがないか確認**
  ```bash
  git status
  # 機密ファイルが "Changes not staged" に混入していないこと
  ```

- [ ] **5-3. `vagrant snapshot save "v1.2g-stable"`**
  ```bash
  cd infrastructure/vagrant/production
  vagrant snapshot save "v1.2g-stable"
  vagrant snapshot list
  ```

### ✅ v1.2g 完了基準

| 確認項目 | 確認方法 |
|---|---|
| tls.key が git 管理外になっている | `git ls-files infrastructure/k8s/ingress/` |
| push で gitleaks が動作する | GitHub Actions タブ |
| Python: ruff + mypy が green | GitHub Actions タブ |
| TypeScript: eslint + tsc が green | GitHub Actions タブ |
| pre-commit が動作する | `pre-commit run --all-files` |
| v1.2g-stable スナップショット保存済み | `vagrant snapshot list` |

---

## 作業メモ欄

- 開始日:
- 完了日:
- 注記:
