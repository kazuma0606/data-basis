/**
 * Component tests for /ops/scoring
 */
import React from "react";
import { render, screen } from "@testing-library/react";

jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));

import { apiFetch } from "@/lib/api";
import ScoringPage from "@/app/ops/scoring/page";
import type { BatchInfo } from "@/lib/types";

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

const MOCK_BATCHES: BatchInfo[] = [
  {
    id: 1,
    batch_type: "churn_risk",
    status: "completed",
    started_at: "2026-03-16T00:00:00Z",
    finished_at: "2026-03-16T00:30:00Z",
    records_processed: 45678,
    next_run_at: "2026-03-23T00:00:00Z",
  },
  {
    id: 2,
    batch_type: "category_affinity",
    status: "running",
    started_at: "2026-03-16T01:00:00Z",
    finished_at: null,
    records_processed: null,
    next_run_at: null,
  },
];

describe("ScoringPage", () => {
  beforeEach(() => jest.clearAllMocks());

  it("バッチ一覧が正常に描画される", async () => {
    mockApiFetch.mockResolvedValue(MOCK_BATCHES);

    const page = await ScoringPage();
    render(page);

    expect(screen.getByText("スコアリングバッチ")).toBeInTheDocument();
    expect(screen.getByText("チャーンリスク")).toBeInTheDocument();
    expect(screen.getByText("カテゴリ親和性")).toBeInTheDocument();

    // ステータスバッジ
    expect(screen.getByText("完了")).toBeInTheDocument();
    expect(screen.getByText("実行中")).toBeInTheDocument();

    // 処理件数
    expect(screen.getByText("45,678 件")).toBeInTheDocument();
  });

  it("バッチが空のとき「履歴がありません」を表示", async () => {
    mockApiFetch.mockResolvedValue([]);

    const page = await ScoringPage();
    render(page);

    expect(screen.getByText("バッチ履歴がありません")).toBeInTheDocument();
  });

  it("APIエラー時にエラーメッセージを表示", async () => {
    mockApiFetch.mockRejectedValue(new Error("取得失敗"));

    const page = await ScoringPage();
    render(page);

    expect(screen.getByText("取得失敗")).toBeInTheDocument();
  });
});
