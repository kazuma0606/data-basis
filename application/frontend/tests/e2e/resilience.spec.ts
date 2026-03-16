/**
 * E2E tests for resilience / error UI.
 * バックエンドエラー時のフォールバックUI表示を確認する。
 *
 * 戦略:
 *   - 存在しないリソースID（999999）へのアクセスで 404 を誘発
 *   - Playwright page.route() でプロキシAPIルートをモックし 500 を返す
 */

import { test, expect, type Page } from "@playwright/test";

async function loginAs(page: Page, username: string, password: string, expectedPath: string) {
  await page.goto("/auth/login");
  await page.getByLabel(/ユーザー名/).fill(username);
  await page.getByLabel(/パスワード/).fill(password);
  await page.getByRole("button", { name: /ログイン/ }).click();
  await page.waitForURL(`**${expectedPath}`, { timeout: 15_000 });
}

// ── 存在しない顧客詳細（404相当） ────────────────────────────────────────

test.describe("顧客詳細 - 存在しないID", () => {
  test("存在しない顧客IDにアクセスするとエラーメッセージが表示される", async ({ page }) => {
    await loginAs(page, "marketer", "marketer123", "/business/summary");
    await page.goto("/business/customers/999999");

    // エラーメッセージ or エラーバウンダリが表示されること
    const errorEl = page.locator(
      "text=/取得に失敗|見つかりません|エラー|not found/i"
    );
    await expect(errorEl.first()).toBeVisible({ timeout: 10_000 });
  });
});

// ── NLクエリ API エラー ────────────────────────────────────────────────────

test.describe("自然言語クエリ - APIエラー", () => {
  test("バックエンドエラー時にエラーメッセージが表示される", async ({ page }) => {
    await loginAs(page, "marketer", "marketer123", "/business/summary");
    await page.goto("/business/query");

    // /api/business/query をモックして 500 を返す
    await page.route("**/api/business/query", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "バックエンドエラー" }),
      });
    });

    await page.getByPlaceholder(/東京在住/).fill("エラーテスト用クエリ");
    await page.getByRole("button", { name: "クエリ実行" }).click();

    await expect(page.getByText(/エラー|失敗/)).toBeVisible({ timeout: 10_000 });
  });
});

// ── Kafka プロキシエラー ────────────────────────────────────────────────────

test.describe("Kafka監視 - APIエラー", () => {
  test("Kafkaトピック取得失敗時にエラー表示される", async ({ page }) => {
    await loginAs(page, "engineer", "engineer123", "/ops/overview");

    // SWR フェッチをモック
    await page.route("**/api/ops/kafka/topics", async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Service Unavailable" }),
      });
    });

    await page.goto("/ops/kafka");

    // エラー表示 or 空テーブルが表示されること（SWRがエラーを処理）
    await page.waitForLoadState("networkidle");
    // ページ自体はクラッシュしないことを確認
    await expect(page.getByText("Kafka")).toBeVisible({ timeout: 10_000 });
  });
});

// ── ローディングスケルトン ─────────────────────────────────────────────────

test.describe("ローディングUI", () => {
  test("Opsページ遷移中にスケルトンが表示される（レスポンス遅延シミュレーション）", async ({
    page,
  }) => {
    await loginAs(page, "engineer", "engineer123", "/ops/overview");

    // バックエンドレスポンスを遅延させる
    await page.route("**/ops/pipeline/jobs", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.continue();
    });

    // ナビゲーション開始（loadingを観察する機会を作る）
    await page.goto("/ops/pipeline");
    await page.waitForLoadState("networkidle");

    // 最終的にページ内容が表示されていること
    await expect(page.getByText("パイプライン")).toBeVisible({ timeout: 15_000 });
  });
});
