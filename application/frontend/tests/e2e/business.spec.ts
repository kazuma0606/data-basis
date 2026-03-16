/**
 * E2E tests for Business Dashboard (/business/*).
 * 実バックエンド（http://192.168.56.10:30800）に対して実行する。
 * 前提: バックエンドが起動済み、テストユーザーがDBに存在すること。
 *
 * テストユーザー:
 *   marketer      / marketer123  → /business/*
 *   store_manager / manager123   → /business/*
 */

import { test, expect, type Page } from "@playwright/test";

// ── ヘルパー ──────────────────────────────────────────────────────────────

async function loginAs(page: Page, username: string, password: string) {
  await page.goto("/auth/login");
  await page.getByLabel(/ユーザー名/).fill(username);
  await page.getByLabel(/パスワード/).fill(password);
  await page.getByRole("button", { name: /ログイン/ }).click();
  await page.waitForURL("**/business/summary", { timeout: 15_000 });
}

// ── ビジネスサマリ ─────────────────────────────────────────────────────────

test.describe("ビジネスサマリ (/business/summary)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "marketer", "marketer123");
  });

  test("KPIカードが表示される", async ({ page }) => {
    await expect(page.getByText("アクティブ顧客")).toBeVisible();
    await expect(page.getByText("休眠顧客")).toBeVisible();
    await expect(page.getByText("チャーン顧客")).toBeVisible();
    await expect(page.getByText("チャーン率")).toBeVisible();
    await expect(page.getByText("週次売上")).toBeVisible();
  });

  test("売上チャートが表示される", async ({ page }) => {
    await expect(page.getByText("チャネル別売上（直近30日）")).toBeVisible();
  });
});

// ── 顧客一覧 ──────────────────────────────────────────────────────────────

test.describe("顧客一覧 (/business/customers)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "marketer", "marketer123");
    await page.goto("/business/customers");
  });

  test("顧客一覧ページが表示される", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "顧客一覧" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "氏名" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "メール" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "都道府県" })).toBeVisible();
  });

  test("顧客リンクをクリックすると詳細ページに遷移する", async ({ page }) => {
    // テーブル内の最初の顧客リンクをクリック
    const firstLink = page.locator("table a").first();
    await firstLink.click();

    await page.waitForURL("**/business/customers/**", { timeout: 10_000 });
    expect(page.url()).toMatch(/\/business\/customers\/\d+/);
  });

  test("ページネーションが合計件数と共に表示される", async ({ page }) => {
    // total が PAGE_SIZE (20) より多い場合のみ確認
    const totalText = page.getByText(/全 \d+,?\d* 件/);
    await expect(totalText.first()).toBeVisible();
  });
});

// ── 顧客詳細 ──────────────────────────────────────────────────────────────

test.describe("顧客詳細 (/business/customers/[id])", () => {
  test("顧客詳細ページが表示される", async ({ page }) => {
    await loginAs(page, "marketer", "marketer123");
    await page.goto("/business/customers");

    // テーブル内の最初の顧客リンクをクリック
    const link = page.locator("table a").first();
    await link.click();
    await page.waitForURL("**/business/customers/**", { timeout: 10_000 });

    await expect(page.getByText("基本情報")).toBeVisible();
  });

  test("一覧に戻るリンクがある", async ({ page }) => {
    await loginAs(page, "marketer", "marketer123");
    await page.goto("/business/customers");

    const link = page.locator("table a").first();
    await link.click();
    await page.waitForURL("**/business/customers/**", { timeout: 10_000 });

    const backLink = page.getByRole("link", { name: "← 顧客一覧" });
    await expect(backLink).toBeVisible();
    await backLink.click();
    await page.waitForURL("**/business/customers", { timeout: 5_000 });
    expect(page.url()).toContain("/business/customers");
  });
});

// ── セグメント分析 ─────────────────────────────────────────────────────────

test.describe("セグメント分析 (/business/segments)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "marketer", "marketer123");
    await page.goto("/business/segments");
  });

  test("セグメント分析ページが表示される", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "セグメント分析" })).toBeVisible();
    await expect(page.getByText("セグメント構成", { exact: true })).toBeVisible();
    await expect(page.getByText("セグメント推移（週次）")).toBeVisible();
  });
});

// ── カテゴリ親和性 ─────────────────────────────────────────────────────────

test.describe("カテゴリ親和性 (/business/affinity)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "marketer", "marketer123");
    await page.goto("/business/affinity");
  });

  test("親和性ページが表示される", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "カテゴリ親和性" })).toBeVisible();
    await expect(page.getByText("親和性ヒートマップ")).toBeVisible();
  });
});

// ── 自然言語クエリ ─────────────────────────────────────────────────────────

test.describe("自然言語クエリ (/business/query)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "marketer", "marketer123");
    await page.goto("/business/query");
  });

  test("クエリページが表示される", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "自然言語クエリ" })).toBeVisible();
    await expect(page.getByPlaceholder(/東京在住/)).toBeVisible();
    await expect(page.getByRole("button", { name: "クエリ実行" })).toBeVisible();
  });

  test("空欄ではボタンが無効化されている", async ({ page }) => {
    const button = page.getByRole("button", { name: "クエリ実行" });
    await expect(button).toBeDisabled();
  });

  test("クエリを入力するとボタンが有効化される", async ({ page }) => {
    await page.getByPlaceholder(/東京在住/).fill("アクティブ顧客は何人いますか？");
    const button = page.getByRole("button", { name: "クエリ実行" });
    await expect(button).toBeEnabled();
  });
});

// ── サイドバーナビゲーション ──────────────────────────────────────────────

test.describe("サイドバーナビゲーション", () => {
  test("marketer: すべてのナビアイテムが表示され機能する", async ({ page }) => {
    await loginAs(page, "marketer", "marketer123");

    // サマリ
    await expect(page.getByRole("link", { name: /サマリ/ })).toBeVisible();
    // 顧客一覧
    await page.getByRole("link", { name: /顧客一覧/ }).first().click();
    await page.waitForURL("**/business/customers", { timeout: 5_000 });
    expect(page.url()).toContain("/business/customers");

    // セグメント
    await page.getByRole("link", { name: /セグメント/ }).click();
    await page.waitForURL("**/business/segments", { timeout: 5_000 });
    expect(page.url()).toContain("/business/segments");

    // 親和性
    await page.getByRole("link", { name: /親和性/ }).click();
    await page.waitForURL("**/business/affinity", { timeout: 5_000 });
    expect(page.url()).toContain("/business/affinity");

    // クエリ
    await page.getByRole("link", { name: /クエリ/ }).click();
    await page.waitForURL("**/business/query", { timeout: 5_000 });
    expect(page.url()).toContain("/business/query");
  });
});
