/**
 * Component tests for /ops/overview
 * apiFetch は jest.mock で差し替え。
 */
import React from "react";
import { render, screen } from "@testing-library/react";

// apiFetch をモック
jest.mock("@/lib/api", () => ({
  apiFetch: jest.fn(),
}));

import { apiFetch } from "@/lib/api";
import OpsOverviewPage from "@/app/ops/overview/page";
import type { HealthResponse } from "@/lib/types";

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

const MOCK_HEALTH: HealthResponse = {
  overall: "healthy",
  services: [
    { name: "postgresql", status: "healthy", error: null },
    { name: "clickhouse", status: "healthy", error: null },
    { name: "kafka",      status: "healthy", error: null },
    { name: "redis",      status: "warning", error: "high memory" },
  ],
};

describe("OpsOverviewPage", () => {
  beforeEach(() => jest.clearAllMocks());

  it("ヘルスチェックデータが正常に描画される", async () => {
    mockApiFetch.mockResolvedValue(MOCK_HEALTH);

    const page = await OpsOverviewPage();
    render(page);

    expect(screen.getByText("システム概要")).toBeInTheDocument();
    expect(screen.getByText("全体ステータス")).toBeInTheDocument();

    // サービスバッジ
    expect(screen.getByText("postgresql")).toBeInTheDocument();
    expect(screen.getByText("kafka")).toBeInTheDocument();
    // warning サービスのエラー表示
    expect(screen.getByText("high memory")).toBeInTheDocument();
  });

  it("APIエラー時にエラーメッセージが表示される", async () => {
    mockApiFetch.mockRejectedValue(new Error("接続できません"));

    const page = await OpsOverviewPage();
    render(page);

    expect(screen.getByText("接続できません")).toBeInTheDocument();
  });
});
