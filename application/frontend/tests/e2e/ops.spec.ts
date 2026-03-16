/**
 * E2E tests for Ops ダッシュボード
 * 実バックエンド（http://192.168.56.10:30800）に対して実行。
 *
 * テストユーザー:
 *   engineer      / engineer123  → /ops/* にアクセス可能
 *   marketer      / marketer123  → /ops/* にアクセス不可（リダイレクト）
 */

import { test, expect, type Page } from "@playwright/test";

// ── ヘルパー ──────────────────────────────────────────────────────────────

async function loginAs(page: Page, username: string, password: string) {
  await page.goto("/auth/login");
  await page.getByLabel(/ユーザー名/).fill(username);
  await page.getByLabel(/パスワード/).fill(password);
  await page.getByRole("button", { name: /ログイン/ }).click();
  await page.waitForURL(`**/${username === "engineer" ? "ops" : "business"}/**`, {
    timeout: 15_000,
  });
}

async function logout(page: Page) {
  await page.request.post("/api/auth/signout");
}

// ── engineer アクセス ─────────────────────────────────────────────────────

test.describe("engineer — Ops ダッシュボード", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "engineer", "engineer123");
  });

  test.afterEach(async ({ page }) => {
    await logout(page);
  });

  test("/ops/overview が表示される", async ({ page }) => {
    await page.goto("/ops/overview");
    await expect(page.getByText("システム概要")).toBeVisible({ timeout: 10_000 });
  });

  test("/ops/kafka が表示される", async ({ page }) => {
    await page.goto("/ops/kafka");
    await expect(page.getByText("Kafka モニタリング")).toBeVisible({ timeout: 10_000 });
    // トピックテーブルが存在する（空でも OK）
    await expect(page.getByRole("table")).toBeVisible();
  });

  test("/ops/pipeline が表示される", async ({ page }) => {
    await page.goto("/ops/pipeline");
    await expect(page.getByText("パイプライン実行履歴")).toBeVisible({ timeout: 10_000 });
  });

  test("/ops/scoring が表示される", async ({ page }) => {
    await page.goto("/ops/scoring");
    await expect(page.getByText("スコアリングバッチ")).toBeVisible({ timeout: 10_000 });
  });

  test("/ops/schema が表示される", async ({ page }) => {
    await page.goto("/ops/schema");
    await expect(page.getByText("スキーマ参照")).toBeVisible({ timeout: 10_000 });
  });

  test("サイドバーのナビゲーションで各ページに遷移できる", async ({ page }) => {
    await page.goto("/ops/overview");

    await page.getByRole("link", { name: /Kafka/ }).click();
    await expect(page).toHaveURL(/\/ops\/kafka/);

    await page.getByRole("link", { name: /パイプライン/ }).click();
    await expect(page).toHaveURL(/\/ops\/pipeline/);

    await page.getByRole("link", { name: /スコアリング/ }).click();
    await expect(page).toHaveURL(/\/ops\/scoring/);

    await page.getByRole("link", { name: /スキーマ/ }).click();
    await expect(page).toHaveURL(/\/ops\/schema/);
  });
});

// ── marketer アクセス制御 ──────────────────────────────────────────────────

test.describe("marketer — Ops へのアクセス制御", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "marketer", "marketer123");
  });

  test.afterEach(async ({ page }) => {
    await logout(page);
  });

  test("/ops/overview にアクセスすると /business/summary にリダイレクトされる", async ({
    page,
  }) => {
    await page.goto("/ops/overview");
    await page.waitForURL("**/business/summary", { timeout: 5_000 });
    expect(page.url()).toContain("/business/summary");
  });
});

// ── 未認証アクセス ────────────────────────────────────────────────────────

test.describe("未認証 — Ops へのアクセス", () => {
  test("/ops/overview にアクセスすると /auth/login にリダイレクトされる", async ({
    page,
  }) => {
    await page.goto("/ops/overview");
    await page.waitForURL("**/auth/login", { timeout: 5_000 });
    expect(page.url()).toContain("/auth/login");
  });
});
