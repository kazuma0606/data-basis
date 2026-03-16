import { render, screen } from "@testing-library/react";
import SegmentsPage from "@/app/business/segments/page";

jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PieChart: ({ children }: { children: React.ReactNode }) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => null,
  Cell: () => null,
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="line-chart">{children}</div>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
}));

import { apiFetch } from "@/lib/api";
const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

const SUMMARY = [
  { label: "active",  count: 10000, percentage: 55.0 },
  { label: "dormant", count: 6000,  percentage: 33.0 },
  { label: "churned", count: 2000,  percentage: 11.0 },
];

const TREND = [
  { week: "2026-03-01", label: "active",  customer_count: 9800, avg_days_since_purchase: 5 },
  { week: "2026-03-01", label: "dormant", customer_count: 6100, avg_days_since_purchase: 90 },
];

describe("SegmentsPage", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders segment detail table with counts", async () => {
    mockApiFetch
      .mockResolvedValueOnce(SUMMARY)
      .mockResolvedValueOnce(TREND);

    const page = await SegmentsPage();
    render(page);

    expect(screen.getByText("10,000")).toBeInTheDocument();
    expect(screen.getByText("6,000")).toBeInTheDocument();
    expect(screen.getByText("2,000")).toBeInTheDocument();
  });

  it("renders segment percentages", async () => {
    mockApiFetch
      .mockResolvedValueOnce(SUMMARY)
      .mockResolvedValueOnce(TREND);

    const page = await SegmentsPage();
    render(page);

    expect(screen.getByText("55.0%")).toBeInTheDocument();
    expect(screen.getByText("33.0%")).toBeInTheDocument();
    expect(screen.getByText("11.0%")).toBeInTheDocument();
  });

  it("renders chart containers", async () => {
    mockApiFetch
      .mockResolvedValueOnce(SUMMARY)
      .mockResolvedValueOnce(TREND);

    const page = await SegmentsPage();
    render(page);

    expect(screen.getByTestId("pie-chart")).toBeInTheDocument();
    expect(screen.getByTestId("line-chart")).toBeInTheDocument();
  });

  it("shows error when summary fetch fails", async () => {
    mockApiFetch
      .mockRejectedValueOnce(new Error("セグメント取得エラー"))
      .mockResolvedValueOnce([]);

    const page = await SegmentsPage();
    render(page);

    expect(screen.getByText(/セグメント取得エラー/)).toBeInTheDocument();
  });
});
