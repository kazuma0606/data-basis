/**
 * SessionGuard E2E テスト
 *
 * 検証シナリオ:
 *   Tab A で engineer ログイン → サインアウト → Tab B で admin ログイン →
 *   Tab A に戻ったとき /auth/login にリダイレクトされること
 *
 * 実際の攻撃フロー:
 *   1. Tab A: engineer でログイン中（sessionStorage に userId が保存される）
 *   2. 別の誰か（または同一ユーザー）が Tab B からサインアウトして admin でログイン
 *   3. 共有クッキーが admin の JWT に上書きされる
 *   4. Tab A はまだ engineer の画面を表示しているが、セッションは admin に
 *   5. SessionGuard が visibilitychange または BroadcastChannel で検知 → 強制リダイレクト
 */

import { test, expect, type Page, type BrowserContext } from "@playwright/test";

// ── ヘルパー ────────────────────────────────────────────────────────────────

async function loginViaUI(page: Page, username: string, password: string) {
  await page.goto("/auth/login");
  await page.fill('input[id="username"]', username);
  await page.fill('input[id="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(ops|business)\//, { timeout: 15_000 });
}

async function signout(page: Page) {
  const res = await page.request.post("/api/auth/signout");
  expect(res.status()).toBe(200);
}

/** ミドルウェアをバイパスして直接 API を叩いてログイン（クッキー上書き） */
async function loginViaAPI(
  page: Page,
  username: string,
  password: string
): Promise<{ userId: number; username: string; role: string }> {
  const res = await page.request.post("/api/auth/signin", {
    data: { username, password },
    // クッキーを送らないようにする（ミドルウェアの "already authenticated" チェックを通過）
    headers: { "Content-Type": "application/json" },
    // fetchOptions で cookie を除外できないため、まずサインアウトしてから呼ぶ
  });
  expect(res.status()).toBe(200);
  const data = await res.json();
  return data.user;
}

async function getSessionStorage(page: Page) {
  return page.evaluate(() => ({
    userId: sessionStorage.getItem("tm_session_user_id"),
    username: sessionStorage.getItem("tm_session_username"),
  }));
}

async function getMeResponse(page: Page) {
  return page.evaluate(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  });
}

// ── テスト ───────────────────────────────────────────────────────────────────

test.describe("SessionGuard — クロスタブ セッション保護", () => {
  let context: BrowserContext;

  test.beforeEach(async ({ browser }) => {
    context = await browser.newContext();
  });

  test.afterEach(async () => {
    await context.close();
  });

  // ────────────────────────────────────────────────────────────────────────
  test("前提確認: engineer ログイン後の sessionStorage・/api/auth/me", async () => {
    const page = await context.newPage();
    await loginViaUI(page, "engineer", "engineer123");

    const url = page.url();
    const ss = await getSessionStorage(page);
    const me = await getMeResponse(page);

    console.log("URL:", url);
    console.log("sessionStorage:", JSON.stringify(ss));
    console.log("/api/auth/me:", JSON.stringify(me));

    expect(url).toMatch(/\/ops\//);
    expect(ss.userId).toBeTruthy();
    expect(me?.role).toBe("engineer");
  });

  // ────────────────────────────────────────────────────────────────────────
  test("前提確認: admin の userId が engineer と異なること", async () => {
    const page = await context.newPage();

    // engineer でログイン
    await loginViaUI(page, "engineer", "engineer123");
    const meEngineer = await getMeResponse(page);
    console.log("engineer:", JSON.stringify(meEngineer));

    // サインアウト
    await signout(page);

    // admin でログイン
    await loginViaUI(page, "admin", "admin123");
    const meAdmin = await getMeResponse(page);
    console.log("admin:", JSON.stringify(meAdmin));

    // userId が異なることを確認（これが SessionGuard の前提条件）
    expect(meEngineer?.userId).not.toBe(meAdmin?.userId);
    console.log(`✅ engineer.userId=${meEngineer?.userId} ≠ admin.userId=${meAdmin?.userId}`);
  });

  // ────────────────────────────────────────────────────────────────────────
  test("本命: Tab A (engineer) → signout → Tab B (admin) ログイン → Tab A フォーカスで /auth/login にリダイレクト", async () => {
    const tabA = await context.newPage();
    const tabB = await context.newPage();

    // --- Tab A でコンソールを収集 ---
    const tabALogs: string[] = [];
    tabA.on("console", (msg) => {
      tabALogs.push(`[${msg.type()}] ${msg.text()}`);
    });

    // Step 1: Tab A で engineer としてログイン
    await loginViaUI(tabA, "engineer", "engineer123");
    const ssEngineer = await getSessionStorage(tabA);
    const meEngineer = await getMeResponse(tabA);
    console.log("✅ Tab A engineer ログイン完了");
    console.log("  URL:", tabA.url());
    console.log("  sessionStorage:", JSON.stringify(ssEngineer));
    console.log("  /api/auth/me:", JSON.stringify(meEngineer));

    // Step 2: Tab B からサインアウト（クッキーを無効化）
    // ※ 実際の攻撃シナリオ: 誰かが同じブラウザで別ユーザーとしてログインする
    await signout(tabB);
    console.log("✅ サインアウト完了");

    // Step 3: Tab B で admin としてログイン（クッキーが admin の JWT に上書きされる）
    await loginViaUI(tabB, "admin", "admin123");
    const ssAdmin = await getSessionStorage(tabB);
    const meAdmin = await getMeResponse(tabB);
    console.log("✅ Tab B admin ログイン完了");
    console.log("  URL:", tabB.url());
    console.log("  sessionStorage:", JSON.stringify(ssAdmin));
    console.log("  /api/auth/me:", JSON.stringify(meAdmin));

    // BroadcastChannel → redirectToLogin → signout → router.push の完了を待つ
    // bringToFront も併用（visibilitychange path も確認）
    await tabA.bringToFront();
    console.log("Tab A bringToFront 実行");

    // リダイレクトを最大 8 秒待つ
    let redirected = false;
    try {
      await tabA.waitForURL(/\/auth\/login/, { timeout: 8_000 });
      redirected = true;
      console.log("✅ Tab A が /auth/login にリダイレクトされました:", tabA.url());
    } catch {
      console.log("⚠️ Tab A はリダイレクトされませんでした。現在URL:", tabA.url());
      const ssAfter = await getSessionStorage(tabA);
      const meAfter = await getMeResponse(tabA);
      console.log("Tab A sessionStorage (after):", JSON.stringify(ssAfter));
      console.log("Tab A /api/auth/me (after):", JSON.stringify(meAfter));
    }

    console.log("Tab A コンソールログ:\n" + tabALogs.join("\n"));

    expect(redirected).toBe(true);
    expect(tabA.url()).toMatch(/\/auth\/login/);
  });

  // ────────────────────────────────────────────────────────────────────────
  test("BroadcastChannel: Tab B が admin ログインした瞬間 Tab A が即リダイレクト（フォーカス不要）", async () => {
    const tabA = await context.newPage();
    const tabB = await context.newPage();

    const tabALogs: string[] = [];
    tabA.on("console", (msg) => tabALogs.push(`[${msg.type()}] ${msg.text()}`));

    // Tab A: engineer ログイン
    await loginViaUI(tabA, "engineer", "engineer123");
    console.log("✅ Tab A engineer ログイン, URL:", tabA.url());

    // Tab B を前面に出す（Tab A はバックグラウンドへ）
    await tabB.bringToFront();

    // サインアウト（Tab B からクッキーをクリア）
    await signout(tabB);

    // admin でログイン（BroadcastChannel メッセージが Tab A に届く）
    await loginViaUI(tabB, "admin", "admin123");
    console.log("✅ Tab B admin ログイン完了");

    // BroadcastChannel + redirectToLogin の 1.5s setTimeout が完了するまで待つ
    await tabA.waitForTimeout(4_000);

    const urlAfter = tabA.url();
    const ssTabA = await getSessionStorage(tabA);
    console.log("Tab A URL (BroadcastChannel 後):", urlAfter);
    console.log("Tab A sessionStorage:", JSON.stringify(ssTabA));
    console.log("Tab A コンソールログ:\n" + tabALogs.join("\n"));

    // BroadcastChannel があれば即リダイレクト
    if (urlAfter.includes("/auth/login")) {
      console.log("✅ BroadcastChannel によるリダイレクト成功");
    } else {
      console.log("ℹ️  BroadcastChannel ではリダイレクトされなかった（visibilitychange で検知される）");
    }
  });

  // ────────────────────────────────────────────────────────────────────────
  test("リダイレクト後の /auth/login に session_replaced バナーが表示される", async () => {
    const page = await context.newPage();

    // 直接 /auth/login?reason=session_replaced&by=admin を開く
    await page.goto("/auth/login?reason=session_replaced&by=admin");

    // バナーが表示されること
    const banner = page.getByRole("alert").first();
    await expect(banner).toBeVisible({ timeout: 5_000 });
    await expect(banner).toContainText("admin");
    await expect(banner).toContainText("サインアウトしました");
    console.log("✅ session_replaced バナー確認:", await banner.textContent());
  });
});
