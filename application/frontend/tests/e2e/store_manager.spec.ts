/**
 * E2E tests for store_manager role access.
 * store_manager は /business/* のみアクセス可能（APIが store_id で自動フィルタ）。
 */

import { test, expect, type Page } from "@playwright/test";

async function loginAs(page: Page, username: string, password: string, expectedPath: string) {
  await page.goto("/auth/login");
  await page.getByLabel(/ユーザー名/).fill(username);
  await page.getByLabel(/パスワード/).fill(password);
  await page.getByRole("button", { name: /ログイン/ }).click();
  await page.waitForURL(`**${expectedPath}`, { timeout: 15_000 });
}

test.describe("store_manager ロール", () => {
  test("store_manager でログイン → /business/summary にリダイレクト", async ({ page }) => {
    await loginAs(page, "store_manager", "manager123", "/business/summary");
    expect(page.url()).toContain("/business/summary");
  });

  test("store_manager は /ops/* にアクセスできない", async ({ page }) => {
    await loginAs(page, "store_manager", "manager123", "/business/summary");

    await page.goto("/ops/overview");
    await page.waitForURL("**/business/summary", { timeout: 5_000 });
    expect(page.url()).toContain("/business/summary");
  });

  test("store_manager: 顧客一覧が表示される", async ({ page }) => {
    await loginAs(page, "store_manager", "manager123", "/business/summary");
    await page.goto("/business/customers");

    await expect(page.getByText("顧客一覧")).toBeVisible();
  });

  test("store_manager: セグメント分析が表示される", async ({ page }) => {
    await loginAs(page, "store_manager", "manager123", "/business/summary");
    await page.goto("/business/segments");

    await expect(page.getByText("セグメント分析")).toBeVisible();
  });

  test("store_manager: ヘッダーにロールラベルが表示される", async ({ page }) => {
    await loginAs(page, "store_manager", "manager123", "/business/summary");

    await expect(page.getByText(/店舗マネージャー/)).toBeVisible();
  });
});

test.describe("engineer が /business/* へのアクセスを試みる", () => {
  test("engineer は /business/summary にアクセスできず /ops/overview にリダイレクト", async ({
    page,
  }) => {
    await loginAs(page, "engineer", "engineer123", "/ops/overview");

    await page.goto("/business/summary");
    await page.waitForURL("**/ops/overview", { timeout: 5_000 });
    expect(page.url()).toContain("/ops/overview");
  });

  test("engineer は /business/customers にアクセスできない", async ({ page }) => {
    await loginAs(page, "engineer", "engineer123", "/ops/overview");

    await page.goto("/business/customers");
    await page.waitForURL("**/ops/overview", { timeout: 5_000 });
    expect(page.url()).toContain("/ops/overview");
  });
});
