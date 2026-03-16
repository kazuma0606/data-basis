import { render, screen } from "@testing-library/react";
import AffinityPage from "@/app/business/affinity/page";

jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));

import { apiFetch } from "@/lib/api";
const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

const AFFINITY_DATA = [
  { week: "2026-03-10", category_id: 1, age_group: "20-29", gender: "F", avg_score: 0.75, customer_count: 120 },
  { week: "2026-03-10", category_id: 2, age_group: "20-29", gender: "F", avg_score: 0.50, customer_count: 85 },
  { week: "2026-03-10", category_id: 1, age_group: "30-39", gender: "M", avg_score: 0.60, customer_count: 200 },
  { week: "2026-03-10", category_id: 2, age_group: "30-39", gender: "M", avg_score: 0.45, customer_count: 150 },
];

describe("AffinityPage", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders heatmap with age groups", async () => {
    mockApiFetch.mockResolvedValueOnce(AFFINITY_DATA);

    const page = await AffinityPage();
    render(page);

    expect(screen.getByText("20-29")).toBeInTheDocument();
    expect(screen.getByText("30-39")).toBeInTheDocument();
  });

  it("renders heatmap with category headers", async () => {
    mockApiFetch.mockResolvedValueOnce(AFFINITY_DATA);

    const page = await AffinityPage();
    render(page);

    expect(screen.getByText("cat_1")).toBeInTheDocument();
    expect(screen.getByText("cat_2")).toBeInTheDocument();
  });

  it("renders score values", async () => {
    mockApiFetch.mockResolvedValueOnce(AFFINITY_DATA);

    const page = await AffinityPage();
    render(page);

    expect(screen.getByText("0.75")).toBeInTheDocument();
    expect(screen.getByText("0.50")).toBeInTheDocument();
  });

  it("shows page title", async () => {
    mockApiFetch.mockResolvedValueOnce(AFFINITY_DATA);

    const page = await AffinityPage();
    render(page);

    expect(screen.getByText("カテゴリ親和性")).toBeInTheDocument();
  });

  it("shows error on fetch failure", async () => {
    mockApiFetch.mockRejectedValueOnce(new Error("親和性データ取得エラー"));

    const page = await AffinityPage();
    render(page);

    expect(screen.getByText(/親和性データ取得エラー/)).toBeInTheDocument();
  });

  it("shows empty state when no data", async () => {
    mockApiFetch.mockResolvedValueOnce([]);

    const page = await AffinityPage();
    render(page);

    expect(screen.getByText("データがありません")).toBeInTheDocument();
  });
});
