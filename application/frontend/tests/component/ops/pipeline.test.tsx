/**
 * Component tests for /ops/pipeline
 */
import React from "react";
import { render, screen } from "@testing-library/react";

jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));

import { apiFetch } from "@/lib/api";
import PipelinePage from "@/app/ops/pipeline/page";
import type { JobInfo } from "@/lib/types";

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

const MOCK_JOBS: JobInfo[] = [
  {
    id: 1,
    job_name: "ec_events_ingest",
    status: "completed",
    started_at: "2026-03-16T01:00:00Z",
    finished_at: "2026-03-16T01:05:00Z",
    records_processed: 12345,
    error_message: null,
  },
  {
    id: 2,
    job_name: "pos_transactions_ingest",
    status: "failed",
    started_at: "2026-03-16T02:00:00Z",
    finished_at: "2026-03-16T02:01:00Z",
    records_processed: null,
    error_message: "connection timeout",
  },
];

describe("PipelinePage", () => {
  beforeEach(() => jest.clearAllMocks());

  it("ジョブ一覧が正常に描画される", async () => {
    mockApiFetch.mockResolvedValue(MOCK_JOBS);

    const page = await PipelinePage();
    render(page);

    expect(screen.getByText("パイプライン実行履歴")).toBeInTheDocument();
    expect(screen.getByText("ec_events_ingest")).toBeInTheDocument();
    expect(screen.getByText("pos_transactions_ingest")).toBeInTheDocument();

    // ステータスバッジ（サマリ数値と重複するため getAllByText を使用）
    expect(screen.getAllByText("完了").length).toBeGreaterThan(0);
    expect(screen.getAllByText("失敗").length).toBeGreaterThan(0);

    // 処理件数
    expect(screen.getByText("12,345 件")).toBeInTheDocument();
  });

  it("ジョブが空のとき「履歴がありません」を表示", async () => {
    mockApiFetch.mockResolvedValue([]);

    const page = await PipelinePage();
    render(page);

    expect(screen.getByText("ジョブ履歴がありません")).toBeInTheDocument();
  });

  it("APIエラー時にエラーメッセージを表示", async () => {
    mockApiFetch.mockRejectedValue(new Error("サーバーエラー"));

    const page = await PipelinePage();
    render(page);

    expect(screen.getByText("サーバーエラー")).toBeInTheDocument();
  });
});
