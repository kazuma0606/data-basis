# v1.2g 実装計画 — CI/CD 基盤整備

作成日: 2026-03-19
位置づけ: **v1.2.1 着手前の前提作業**（セキュリティ修正 + CI/CD パイプライン確立）

---

## なぜ今やるのか

GitGuardian が `infrastructure/k8s/ingress/tls.key`（自己署名 TLS 秘密鍵）を検出した。
現状は `.gitignore` が唯一の防衛線だが、「書き忘れたら即アウト」という構造的な脆弱さがある。
v1.2.1 以降でより複雑なデータパイプライン・スコアリングコードが増える前に、
**CI/CD を盾として確立する**。

---

## CI/CD はプロジェクトのどの時点で導入すべきだったか

### 結論: v1.1 が正解だった

| フェーズ | 内容 | CI/CD の必要性 |
|---|---|---|
| v1.0 | 要件定義・設計ドキュメント・インフラ設計 | 不要（コードがほぼない） |
| **v1.1** | **FastAPI + Next.js の初期実装** | **ここが導入タイミング** |
| v1.2 | データパイプライン・スコアリング | 遅くともここまでに必要 |
| v1.2g | ← 今ここで導入（遅れているが今が最善） | 必須 |

### 判断基準（一般論）

CI/CD の導入タイミングは「最初のアプリケーションコードが生まれた瞬間」が原則。
理由は「Shift Left（品質・セキュリティチェックを開発の早い段階に移す）」。

このプロジェクトで言えば v1.1 で FastAPI の `/auth/login` と JWT を実装した瞬間に
以下のリスクが生まれた：

1. `JWT_SECRET_KEY` などの秘密情報がコードに混入するリスク
2. 型エラー・lint エラーが積み重なり後の修正コストが増大するリスク
3. 複数コンポーネント（backend / frontend / k8s）の整合性が壊れるリスク

v1.0 はドキュメントと設計だけなので CI は不要。
**「コードが動く環境 = CI が必要な環境」** と覚えておくと判断しやすい。

---

## スコープ

### 対象外

- テスト自動化（jest / pytest の CI 実行）: v1.3 以降で追加
- CD（自動デプロイ）: ローカル VM 環境のため対象外
- Dependabot / SBOM: v1.3 以降で検討

### 対象

```
1. 即時セキュリティ修正
   └─ tls.key / tls.crt を git 管理から除外

2. シークレットスキャン（最優先）
   └─ gitleaks: push のたびに全ブランチを検査しブロック

3. Python コード品質
   └─ ruff（lint）+ mypy（型チェック）: PR ごとに実行

4. TypeScript / Next.js コード品質
   └─ eslint + tsc --noEmit: PR ごとに実行

5. pre-commit フック（ローカル二重防御）
   └─ gitleaks をローカル commit 前にも実行
```

---

## アーキテクチャ

### GitHub Actions ワークフロー構成

```
.github/
  workflows/
    secret-scan.yml   # gitleaks: push 時・全ブランチ対象
    ci-backend.yml    # ruff + mypy: PR 時
    ci-frontend.yml   # eslint + tsc: PR 時
```

### トリガー設計

| ワークフロー | トリガー | 目的 |
|---|---|---|
| secret-scan | push（全ブランチ） | 秘密情報の流出を即時検出・ブロック |
| ci-backend | PR → master, push → v*.x_development | Python 品質ゲート |
| ci-frontend | PR → master, push → v*.x_development | TypeScript 品質ゲート |

### gitleaks 許可リスト（.gitleaks.toml）

以下は意図的なダミー値であり、false positive として除外する。

| ファイル | パターン | 理由 |
|---|---|---|
| `infrastructure/terraform/localstack/main.tf` | `access_key = "test"` | LocalStack 固定値 |
| `infrastructure/k8s/backend/manifest.yaml` | `AWS_ACCESS_KEY_ID: test` | LocalStack 固定値 |
| `application/backend/app/core/config.py` | `aws_access_key_id: str = "test"` | デフォルト値（dev 用） |

### pre-commit 構成

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.21.2
    hooks:
      - id: gitleaks
```

---

## 既存ツール設定の活用

すでに `pyproject.toml` に設定済みのものを CI でそのまま使う。

```toml
# ruff: E / F / I / UP ルール, line-length=100
# mypy: strict=true, python_version="3.12"
```

```json
// package.json に "lint": "eslint ." が定義済み
// TypeScript 5.7.3 が devDependencies に含まれる
```

新たにツールを追加・設定変更する必要はなく、**既存設定を CI に接続するだけ**。

---

## mypy に関する注意

`pyproject.toml` は `strict = true` を設定しているが、
v1.2 時点でバックエンドの全コードが mypy strict をパスするか未確認。

CI 組み込み前に **ローカルで一度 `uv run mypy app/` を実行して baseline を確認**し、
エラーが多い場合は `--ignore-missing-imports` から始めて段階的に強化する。

---

## 本番（AWS）移行との対応

| ローカル CI | 本番想定 |
|---|---|
| GitHub Actions（無料枠） | GitHub Actions（同一） |
| gitleaks Action | AWS CodeGuru Reviewer / GitHub Advanced Security |
| self-hosted ランナー不要 | EKS デプロイ時は self-hosted ランナー追加 |

GitHub Actions は AWS 移行後もそのまま使えるため、移行コストはゼロ。

---

## 完了基準

- [ ] `tls.key` / `tls.crt` が git 管理から完全に除外されている
- [ ] gitleaks が push のたびに動作し、秘密鍵を含む commit をブロックする
- [ ] Python: ruff + mypy が PR ごとに通過する
- [ ] TypeScript: eslint + tsc が PR ごとに通過する
- [ ] ローカル commit 前に pre-commit + gitleaks が動作する
