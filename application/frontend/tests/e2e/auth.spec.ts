/**
 * E2E tests for authentication flows.
 * 実バックエンド（http://192.168.56.10:30800）に対して実行する。
 * 前提: バックエンドが起動済み、テストユーザーがDBに存在すること。
 *
 * テストユーザー:
 *   engineer      / engineer123  → /ops/overview
 *   marketer      / marketer123  → /business/summary
 *   store_manager / manager123   → /business/summary
 */

import { test, expect } from "@playwright/test";

// ── ヘルパー ──────────────────────────────────────────────────────────────

async function login(
  page: Parameters<typeof test>[1] extends (arg: infer T) => unknown ? never : never,
  username: string,
  password: string
) {
  // 型エラー回避のため page を any として受け取る
}

// ── テスト ────────────────────────────────────────────────────────────────

test.describe("ログインページ", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/auth/login");
  });

  test("ログインページが表示される", async ({ page }) => {
    await expect(page.getByText("ログイン", { exact: true }).first()).toBeVisible();
    await expect(page.getByLabel(/ユーザー名/)).toBeVisible();
    await expect(page.getByLabel(/パスワード/)).toBeVisible();
    await expect(page.getByRole("button", { name: /ログイン/ })).toBeVisible();
  });

  test("空欄送信でバリデーションエラーが表示される", async ({ page }) => {
    await page.getByRole("button", { name: /ログイン/ }).click();

    await expect(page.getByText("ユーザー名を入力してください")).toBeVisible();
    await expect(page.getByText("パスワードを入力してください")).toBeVisible();
  });

  test("誤った認証情報でエラーメッセージが表示される", async ({ page }) => {
    await page.getByLabel(/ユーザー名/).fill("wronguser");
    await page.getByLabel(/パスワード/).fill("wrongpass");
    await page.getByRole("button", { name: /ログイン/ }).click();

    await expect(page.getByRole("alert")).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("ロール別ログイン・リダイレクト", () => {
  test("engineer でログイン → /ops/overview にリダイレクト", async ({ page }) => {
    await page.goto("/auth/login");
    await page.getByLabel(/ユーザー名/).fill("engineer");
    await page.getByLabel(/パスワード/).fill("engineer123");
    await page.getByRole("button", { name: /ログイン/ }).click();

    await page.waitForURL("**/ops/overview", { timeout: 15_000 });
    expect(page.url()).toContain("/ops/overview");
  });

  test("marketer でログイン → /business/summary にリダイレクト", async ({ page }) => {
    await page.goto("/auth/login");
    await page.getByLabel(/ユーザー名/).fill("marketer");
    await page.getByLabel(/パスワード/).fill("marketer123");
    await page.getByRole("button", { name: /ログイン/ }).click();

    await page.waitForURL("**/business/summary", { timeout: 15_000 });
    expect(page.url()).toContain("/business/summary");
  });

  test("store_manager でログイン → /business/summary にリダイレクト", async ({ page }) => {
    await page.goto("/auth/login");
    await page.getByLabel(/ユーザー名/).fill("store_manager");
    await page.getByLabel(/パスワード/).fill("manager123");
    await page.getByRole("button", { name: /ログイン/ }).click();

    await page.waitForURL("**/business/summary", { timeout: 15_000 });
    expect(page.url()).toContain("/business/summary");
  });
});

test.describe("ログイン済みユーザーのリダイレクト", () => {
  test("engineer ログイン後に /auth/login を訪れると /ops/overview に戻される", async ({
    page,
  }) => {
    // ログイン
    await page.goto("/auth/login");
    await page.getByLabel(/ユーザー名/).fill("engineer");
    await page.getByLabel(/パスワード/).fill("engineer123");
    await page.getByRole("button", { name: /ログイン/ }).click();
    await page.waitForURL("**/ops/overview", { timeout: 15_000 });

    // ログイン画面に戻ろうとする
    await page.goto("/auth/login");
    await page.waitForURL("**/ops/overview", { timeout: 5_000 });
    expect(page.url()).toContain("/ops/overview");
  });
});

test.describe("ロールベースのアクセス制御", () => {
  test("engineer は /business/* にアクセスできない → /ops/overview にリダイレクト", async ({
    page,
  }) => {
    // ログイン
    await page.goto("/auth/login");
    await page.getByLabel(/ユーザー名/).fill("engineer");
    await page.getByLabel(/パスワード/).fill("engineer123");
    await page.getByRole("button", { name: /ログイン/ }).click();
    await page.waitForURL("**/ops/overview", { timeout: 15_000 });

    // business にアクセス試行
    await page.goto("/business/summary");
    await page.waitForURL("**/ops/overview", { timeout: 5_000 });
    expect(page.url()).toContain("/ops/overview");
  });

  test("marketer は /ops/* にアクセスできない → /business/summary にリダイレクト", async ({
    page,
  }) => {
    // ログイン
    await page.goto("/auth/login");
    await page.getByLabel(/ユーザー名/).fill("marketer");
    await page.getByLabel(/パスワード/).fill("marketer123");
    await page.getByRole("button", { name: /ログイン/ }).click();
    await page.waitForURL("**/business/summary", { timeout: 15_000 });

    // ops にアクセス試行
    await page.goto("/ops/overview");
    await page.waitForURL("**/business/summary", { timeout: 5_000 });
    expect(page.url()).toContain("/business/summary");
  });
});

test.describe("ログアウト", () => {
  test("ログアウト後に /auth/login にリダイレクトされ、保護されたページにアクセスできない", async ({
    page,
  }) => {
    // ログイン
    await page.goto("/auth/login");
    await page.getByLabel(/ユーザー名/).fill("engineer");
    await page.getByLabel(/パスワード/).fill("engineer123");
    await page.getByRole("button", { name: /ログイン/ }).click();
    await page.waitForURL("**/ops/overview", { timeout: 15_000 });

    // ログアウト（API直接呼び出し）
    await page.request.post("/api/auth/signout");

    // 保護されたページにアクセス → ログイン画面へ
    await page.goto("/ops/overview");
    await page.waitForURL("**/auth/login**", { timeout: 5_000 });
    expect(page.url()).toContain("/auth/login");
  });
});
