/**
 * Component tests for the Login page.
 * fetch は jest.fn() でモック。実バックエンドには接続しない。
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// next/navigation をモック
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// ROLE_HOME をモック
jest.mock("@/lib/auth/routes", () => ({
  ROLE_HOME: {
    engineer: "/ops/overview",
    marketer: "/business/summary",
    store_manager: "/business/summary",
    admin: "/ops/overview",
  },
}));

// global fetch をモック
const mockFetch = jest.fn();
global.fetch = mockFetch as typeof fetch;

import LoginPage from "@/app/auth/login/page";

function setup() {
  const user = userEvent.setup();
  render(<LoginPage />);
  return { user };
}

describe("LoginPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── レンダリング ───────────────────────────────────────────────────────

  it("フォームの各要素が描画される", () => {
    setup();
    // CardTitle は <div> レンダリングのため selector 指定
    expect(screen.getByText("ログイン", { selector: "[data-slot='card-title']" })).toBeInTheDocument();
    expect(screen.getByLabelText(/ユーザー名/)).toBeInTheDocument();
    expect(screen.getByLabelText(/パスワード/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ログイン/ })).toBeInTheDocument();
  });

  // ── バリデーション ─────────────────────────────────────────────────────

  it("空欄で送信するとバリデーションエラーが表示される", async () => {
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: /ログイン/ }));

    await waitFor(() => {
      expect(screen.getByText("ユーザー名を入力してください")).toBeInTheDocument();
      expect(screen.getByText("パスワードを入力してください")).toBeInTheDocument();
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("ユーザー名のみ空欄のときエラーが表示される", async () => {
    const { user } = setup();

    await user.type(screen.getByLabelText(/パスワード/), "pass123");
    await user.click(screen.getByRole("button", { name: /ログイン/ }));

    await waitFor(() => {
      expect(screen.getByText("ユーザー名を入力してください")).toBeInTheDocument();
    });
  });

  // ── APIエラー表示 ──────────────────────────────────────────────────────

  it("認証失敗時にサーバーエラーメッセージが表示される", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "ユーザー名またはパスワードが違います" }),
    });

    const { user } = setup();
    await user.type(screen.getByLabelText(/ユーザー名/), "wrong");
    await user.type(screen.getByLabelText(/パスワード/), "wrong");
    await user.click(screen.getByRole("button", { name: /ログイン/ }));

    await waitFor(() => {
      expect(
        screen.getByRole("alert", { hidden: false })
      ).toHaveTextContent("ユーザー名またはパスワードが違います");
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it("ネットワークエラー時にフォールバックメッセージが表示される", async () => {
    mockFetch.mockRejectedValue(new Error("network failure"));

    const { user } = setup();
    await user.type(screen.getByLabelText(/ユーザー名/), "engineer");
    await user.type(screen.getByLabelText(/パスワード/), "engineer123");
    await user.click(screen.getByRole("button", { name: /ログイン/ }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "ネットワークエラーが発生しました"
      );
    });
  });

  // ── ログイン成功・ロール別リダイレクト ────────────────────────────────

  it("engineer ログイン成功 → /ops/overview にリダイレクト", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        user: { userId: 1, username: "engineer", role: "engineer", storeId: null },
      }),
    });

    const { user } = setup();
    await user.type(screen.getByLabelText(/ユーザー名/), "engineer");
    await user.type(screen.getByLabelText(/パスワード/), "engineer123");
    await user.click(screen.getByRole("button", { name: /ログイン/ }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/ops/overview");
    });
  });

  it("marketer ログイン成功 → /business/summary にリダイレクト", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        user: { userId: 2, username: "marketer", role: "marketer", storeId: null },
      }),
    });

    const { user } = setup();
    await user.type(screen.getByLabelText(/ユーザー名/), "marketer");
    await user.type(screen.getByLabelText(/パスワード/), "marketer123");
    await user.click(screen.getByRole("button", { name: /ログイン/ }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/business/summary");
    });
  });

  it("store_manager ログイン成功 → /business/summary にリダイレクト", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        user: {
          userId: 3,
          username: "store_manager",
          role: "store_manager",
          storeId: 1,
        },
      }),
    });

    const { user } = setup();
    await user.type(screen.getByLabelText(/ユーザー名/), "store_manager");
    await user.type(screen.getByLabelText(/パスワード/), "manager123");
    await user.click(screen.getByRole("button", { name: /ログイン/ }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/business/summary");
    });
  });

  // ── 送信中UI ──────────────────────────────────────────────────────────

  it("送信中はボタンが disabled になる", async () => {
    // fetchが解決しないPromiseを返す（ローディング状態を保持）
    mockFetch.mockImplementation(() => new Promise(() => {}));

    const { user } = setup();
    await user.type(screen.getByLabelText(/ユーザー名/), "engineer");
    await user.type(screen.getByLabelText(/パスワード/), "engineer123");
    await user.click(screen.getByRole("button", { name: /ログイン/ }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /ログイン中/ })).toBeDisabled();
    });
  });
});
