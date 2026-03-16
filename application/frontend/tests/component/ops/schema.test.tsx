/**
 * Component tests for /ops/schema
 */
import React from "react";
import { render, screen } from "@testing-library/react";

jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));

import { apiFetch } from "@/lib/api";
import SchemaPage from "@/app/ops/schema/page";
import type { TableSchema } from "@/lib/types";

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

const MOCK_TABLES: TableSchema[] = [
  {
    table_name: "unified_customers",
    columns: [
      { name: "unified_id",    data_type: "UUID",    nullable: false, default: null },
      { name: "full_name",     data_type: "VARCHAR", nullable: false, default: null },
      { name: "email",         data_type: "VARCHAR", nullable: true,  default: null },
      { name: "created_at",    data_type: "TIMESTAMP", nullable: false, default: "now()" },
    ],
  },
  {
    table_name: "customer_scores",
    columns: [
      { name: "unified_id",       data_type: "UUID",   nullable: false, default: null },
      { name: "churn_score",      data_type: "FLOAT",  nullable: true,  default: null },
      { name: "affinity_score",   data_type: "FLOAT",  nullable: true,  default: null },
    ],
  },
];

describe("SchemaPage", () => {
  beforeEach(() => jest.clearAllMocks());

  it("テーブル定義が正常に描画される", async () => {
    mockApiFetch.mockResolvedValue(MOCK_TABLES);

    const page = await SchemaPage();
    render(page);

    expect(screen.getByText("スキーマ参照")).toBeInTheDocument();
    expect(screen.getByText("unified_customers")).toBeInTheDocument();
    expect(screen.getByText("customer_scores")).toBeInTheDocument();

    // カラム名（2テーブルに unified_id が存在するため getAllByText を使用）
    expect(screen.getAllByText("unified_id").length).toBeGreaterThan(0);
    expect(screen.getByText("full_name")).toBeInTheDocument();
    expect(screen.getByText("email")).toBeInTheDocument();

    // 型
    expect(screen.getAllByText("UUID").length).toBeGreaterThan(0);
    expect(screen.getAllByText("VARCHAR").length).toBeGreaterThan(0);

    // NULL制約バッジ
    expect(screen.getAllByText("NOT NULL").length).toBeGreaterThan(0);
    expect(screen.getAllByText("NULL").length).toBeGreaterThan(0);

    // デフォルト値
    expect(screen.getByText("now()")).toBeInTheDocument();
  });

  it("テーブルが空のとき「テーブルが見つかりません」を表示", async () => {
    mockApiFetch.mockResolvedValue([]);

    const page = await SchemaPage();
    render(page);

    expect(screen.getByText("テーブルが見つかりません")).toBeInTheDocument();
  });

  it("APIエラー時にエラーメッセージを表示", async () => {
    mockApiFetch.mockRejectedValue(new Error("DB接続エラー"));

    const page = await SchemaPage();
    render(page);

    expect(screen.getByText("DB接続エラー")).toBeInTheDocument();
  });
});
