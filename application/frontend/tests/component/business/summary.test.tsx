import { render, screen } from "@testing-library/react";
import SummaryPage from "@/app/business/summary/page";

jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));

import { apiFetch } from "@/lib/api";
const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

const KPI_DATA = {
  active_customers: 12345,
  dormant_customers: 6789,
  churned_customers: 1234,
  churn_rate: 0.0823,
  weekly_revenue: 5678900,
};

const SALES_DATA = [
  { date: "2026-03-10", channel: "EC", store_id: null, category_id: null, total_amount: 100000, order_count: 10, customer_count: 8 },
  { date: "2026-03-11", channel: "POS", store_id: 1, category_id: null, total_amount: 200000, order_count: 20, customer_count: 15 },
];

describe("SummaryPage", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders KPI cards with formatted values", async () => {
    mockApiFetch
      .mockResolvedValueOnce(KPI_DATA)
      .mockResolvedValueOnce(SALES_DATA);

    const page = await SummaryPage();
    render(page);

    expect(screen.getByText("12,345")).toBeInTheDocument();
    expect(screen.getByText("6,789")).toBeInTheDocument();
    expect(screen.getByText("1,234")).toBeInTheDocument();
    expect(screen.getByText("8.2%")).toBeInTheDocument();
    expect(screen.getByText("¥5,678,900")).toBeInTheDocument();
  });

  it("shows KPI labels", async () => {
    mockApiFetch
      .mockResolvedValueOnce(KPI_DATA)
      .mockResolvedValueOnce(SALES_DATA);

    const page = await SummaryPage();
    render(page);

    expect(screen.getByText("アクティブ顧客")).toBeInTheDocument();
    expect(screen.getByText("休眠顧客")).toBeInTheDocument();
    expect(screen.getByText("チャーン顧客")).toBeInTheDocument();
    expect(screen.getByText("チャーン率")).toBeInTheDocument();
    expect(screen.getByText("週次売上")).toBeInTheDocument();
  });

  it("shows dashes when KPI fetch fails", async () => {
    mockApiFetch
      .mockRejectedValueOnce(new Error("Backend down"))
      .mockResolvedValueOnce([]);

    const page = await SummaryPage();
    render(page);

    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("shows error message when KPI fetch fails", async () => {
    mockApiFetch
      .mockRejectedValueOnce(new Error("接続エラー"))
      .mockResolvedValueOnce([]);

    const page = await SummaryPage();
    render(page);

    expect(screen.getByText(/接続エラー/)).toBeInTheDocument();
  });
});
