# バージョンロードマップ / TODO

更新日: 2026-03-20

凡例: `✅` 完了 / `🔄` 進行中 / `⬜` 未着手

---

## ✅ v1.0 — 要件定義・設計ドキュメント
> 架空企業テクノマートのデータ基盤要件・アーキテクチャ・スキーマを策定

- ✅ 発注元背景・制約（company.md）
- ✅ ユーザーストーリー・スコアリング設計（user_story.md）
- ✅ 既存データの問題点整理（data_problems.md）
- ✅ インフラ全体アーキテクチャ（architecture.md）
- ✅ テーブル設計・Kafkaトピック対応（data_schema.md）
- ✅ Synthetic Data 生成（verification/）

---

## ✅ v1.1 — 運用安定化
> k3s・ローカルレジストリ・自動起動・Fluent Bit の整備

- ✅ ローカル Docker レジストリ構築
- ✅ k3s 自動起動設定
- ✅ バージョン管理 SQLite（deployments.db）
- ✅ toolbox スクリプト整備（record.sh / status.sh / rollback.sh）
- ✅ Fluent Bit DaemonSet 導入（ログ収集基盤）
- ✅ スナップショット `v1.1-stable` 保存済み

---

## ✅ v1.1.1 — Pod 状態可視化
> Ops ダッシュボードに Pod 死活・ヘルスチェック機能を追加

- ✅ ヘルスチェックエンドポイント実装
- ✅ SSE ストリームエンドポイント実装
- ✅ Pod 状態可視化 UI

---

## ✅ v1.1.2 — デプロイ改善
> デプロイスクリプト・Docker ビルド・イメージ管理の改善

- ✅ .dockerignore 追加（frontend / backend）
- ✅ BuildKit 有効化
- ✅ イメージローテーション実装
- ✅ スナップショット `v1.1.2-stable` 保存済み

---

## ✅ v1.2 — データフロー実装
> 名寄せ・Kafka・スコアリング・ユーザー管理・Nginx Ingress

- ✅ 名寄せパイプライン（EC / POS / アプリで unified_customers を構築）
- ✅ Kafka パイプライン（Synthetic Data → Kafka → S3 / PostgreSQL）
- ✅ スコアリングバッチ（チャーンリスク / カテゴリ親和性 / 購買タイミング / 来店予測）
- ✅ pgvector Embedding 生成バッチ
- ✅ ClickHouse S3 日次ロード ETL
- ✅ ユーザー管理機能（admin 用ユーザー作成 API + /ops/users 画面）
- ✅ Nginx Ingress Controller 導入
- ✅ JWT 認証・ロールベースルーティング
- ✅ 詳細仕様書（spec.md）作成
- ✅ スナップショット `v1.2-stable` 保存済み

---

## ✅ v1.2g — CI/CD 基盤整備
> gitleaks・ruff・mypy・pre-commit によるコード品質ゲート

- ✅ Phase 0: TLS 秘密鍵を git 管理外に（.gitignore + git rm --cached）
- ✅ Phase 1: gitleaks GitHub Actions（全ブランチ push でシークレットスキャン）
- ✅ Phase 2: ruff + mypy → 0 エラー + `ci-backend.yml`
  - mypy 1.19 の制限対応（strict + ignore_errors = true）
  - CI クリーン環境で発覚した 4 エラーを追加修正
- ✅ Phase 3: `ci-frontend.yml`（tsc --noEmit）
- ✅ Phase 4: pre-commit フック（trailing-whitespace / check-yaml / ruff / gitleaks）
- ✅ スナップショット `v1.2g-stable` 保存済み

---

## 🔄 v1.3 — 監視・オブザーバビリティ
> Prometheus / Grafana / Alertmanager / Pushgateway + 各種 Exporter

**専用 UI あり。カスタム画面実装は不要。**
Grafana が中央ハブとなり、Prometheus（メトリクス）・Loki（ログ）を一元管理する。

- ⬜ Phase -1: スナップショット `pre-v1.3` 保存
- ⬜ Phase 1: monitoring namespace + Prometheus + node_exporter
- ⬜ Phase 2: kube-state-metrics
- ⬜ Phase 3: サービス別 Exporter（Kafka / PostgreSQL / ClickHouse / Redis）
- ⬜ Phase 4: Grafana ダッシュボード 6 枚
  - クラスター概要 / Kafka パイプライン / PostgreSQL / ClickHouse / バッチジョブ / Redis
- ⬜ Phase 5: Alertmanager（Slack 通知）
- ⬜ Phase 6: Pushgateway + バッチジョブメトリクス送信
- ⬜ Phase 7: SLO / エラーバジェットダッシュボード
- ⬜ Phase 8: 最終確認・スナップショット `v1.3-stable`

参照: `versions/v1.3/plan.md` / `versions/v1.3/tasks.md`

---

## ⬜ v1.2.1 — メモリ要件ベースライン計測
> v1.2 スタック（監視なし）での RAM 消費をシナリオ別に記録

※ v1.3 完了後の v1.3.1 と合わせて 2 段階で Vagrantfile を最終更新する。

- ⬜ シナリオ A〜G での RAM 計測（アイドル〜全負荷同時）
- ⬜ 結果を `versions/v1.2.1/results.md` に記録
- ⬜ スナップショット `v1.2.1-stable` 保存

参照: `versions/v1.2.1/plan.md`

---

## ⬜ v1.3.1 — Loki 導入 + メモリ要件の最終計測・Vagrantfile 更新

### Grafana Loki（ログ集約）
> Fluent Bit（v1.1 導入済み）→ Loki → Grafana（v1.3 導入済み）
> ELK と比較して RAM ~1/40（~100MB）。専用 UI なし、Grafana Explore から参照。

- ⬜ Loki マニフェスト作成・適用（monitoring namespace）
- ⬜ Fluent Bit の出力先に Loki を追加（ConfigMap 追記のみ）
- ⬜ Grafana に Loki DataSource を追加（プロビジョニング設定）
- ⬜ Grafana ログダッシュボード作成（エラーログ / サービス別ログ量 / バッチジョブ完了）

### メモリ要件の最終計測
> v1.2.1 のベースラインに対し、v1.3 監視スタック + Loki 込みの最終ピーク RAM を計測

- ⬜ シナリオ A〜G での RAM 計測（monitoring namespace 含む）
- ⬜ v1.2.1 比の増分（監視スタック ~2GB + Loki ~100MB）を記録
- ⬜ 推奨 RAM 値を決定（計測ピーク × 1.3 の安全マージン）
- ⬜ `infrastructure/vagrant/production/Vagrantfile` の `vb.memory` を更新
- ⬜ `vagrant reload` で正常起動確認
- ⬜ 結果を `versions/v1.3.1/results.md` に記録
- ⬜ スナップショット `v1.3.1-stable` 保存

参照: `versions/v1.3.1/plan.md`

---

## 備考

### 各ツールの専用 UI

v1.3 以降に導入するツールはすべて専用 UI を持つ。カスタム画面実装は不要。

| ツール | UI | URL（port-forward） |
|---|---|---|
| Grafana | ダッシュボード・Explore・アラート | `localhost:3000` |
| Prometheus | クエリ・Targets・Rules | `localhost:9090` |
| Alertmanager | アラート一覧・サイレンス | `localhost:9093` |
| Pushgateway | push メトリクス一覧 | `localhost:9091` |
| Loki | UI なし（Grafana Explore 経由） | — |

### 画面の役割分担

```
Grafana         → エンジニア：インフラ監視（メトリクス + ログ）
Next.js /ops/   → エンジニア：業務確認（パイプライン・バッチ・スキーマ）
Next.js /business/ → マーケ・店長：顧客分析・KPI
```

### スナップショット一覧

| スナップショット | 対応バージョン | 状態 |
|---|---|---|
| `v1.0-stable` | v1.0 | ✅ 保存済み |
| `v1.1-stable` | v1.1 | ✅ 保存済み |
| `v1.1.2-stable` | v1.1.2 | ✅ 保存済み |
| `v1.2-stable` | v1.2 | ✅ 保存済み |
| `v1.2g-stable` | v1.2g | ✅ 保存済み |
| `pre-v1.3` | v1.3 作業前 | ⬜ 未保存 |
| `v1.2.1-stable` | v1.2.1 | ⬜ 未保存 |
| `v1.3-stable` | v1.3 | ⬜ 未保存 |
| `v1.3.1-stable` | v1.3.1 | ⬜ 未保存 |
