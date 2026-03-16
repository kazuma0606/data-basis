import { render, screen } from "@testing-library/react";
import CustomerDetailPage from "@/app/business/customers/[id]/page";

jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("next/link", () => {
  const Link = ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  );
  Link.displayName = "Link";
  return Link;
});

import { apiFetch } from "@/lib/api";
const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

const CUSTOMER_DETAIL = {
  unified_id: 42,
  canonical_name: "山田太郎",
  email: "yamada@example.com",
  phone: "090-1234-5678",
  birth_date: "1985-04-01",
  prefecture: "東京都",
  churn_label: {
    label: "active",
    last_purchase_at: "2026-03-10T12:00:00Z",
    days_since_purchase: 6,
    updated_at: "2026-03-11T00:00:00Z",
  },
  scores: [
    {
      category_id: 1,
      affinity_score: 0.85,
      churn_risk_score: 0.12,
      visit_predict_score: 0.70,
      timing_score: 0.65,
      updated_at: "2026-03-11T00:00:00Z",
    },
  ],
};

const RECOMMENDATIONS = [
  { unified_product_id: 101, name: "スマートフォン X", brand: "TechBrand", price: 89800, category_id: 1, similarity: 0.923 },
];

function makeProps(id = "42") {
  return { params: Promise.resolve({ id }) };
}

describe("CustomerDetailPage", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders customer name and basic info", async () => {
    mockApiFetch
      .mockResolvedValueOnce(CUSTOMER_DETAIL)
      .mockResolvedValueOnce(RECOMMENDATIONS);

    const page = await CustomerDetailPage(makeProps());
    render(page);

    expect(screen.getAllByText("山田太郎").length).toBeGreaterThan(0);
    expect(screen.getByText("yamada@example.com")).toBeInTheDocument();
    expect(screen.getByText("090-1234-5678")).toBeInTheDocument();
    expect(screen.getByText("東京都")).toBeInTheDocument();
  });

  it("renders churn status badge", async () => {
    mockApiFetch
      .mockResolvedValueOnce(CUSTOMER_DETAIL)
      .mockResolvedValueOnce(RECOMMENDATIONS);

    const page = await CustomerDetailPage(makeProps());
    render(page);

    expect(screen.getByText("アクティブ")).toBeInTheDocument();
  });

  it("renders score table", async () => {
    mockApiFetch
      .mockResolvedValueOnce(CUSTOMER_DETAIL)
      .mockResolvedValueOnce(RECOMMENDATIONS);

    const page = await CustomerDetailPage(makeProps());
    render(page);

    expect(screen.getByText("cat_1")).toBeInTheDocument();
    expect(screen.getByText("0.850")).toBeInTheDocument();
    expect(screen.getByText("0.120")).toBeInTheDocument();
  });

  it("renders recommendations table", async () => {
    mockApiFetch
      .mockResolvedValueOnce(CUSTOMER_DETAIL)
      .mockResolvedValueOnce(RECOMMENDATIONS);

    const page = await CustomerDetailPage(makeProps());
    render(page);

    expect(screen.getByText("スマートフォン X")).toBeInTheDocument();
    expect(screen.getByText("TechBrand")).toBeInTheDocument();
    expect(screen.getByText("¥89,800")).toBeInTheDocument();
    expect(screen.getByText("0.923")).toBeInTheDocument();
  });

  it("shows error on fetch failure", async () => {
    mockApiFetch
      .mockRejectedValueOnce(new Error("顧客が見つかりません"))
      .mockResolvedValueOnce([]);

    const page = await CustomerDetailPage(makeProps("999"));
    render(page);

    expect(screen.getByText(/顧客が見つかりません/)).toBeInTheDocument();
  });

  it("has back link to customer list", async () => {
    mockApiFetch
      .mockResolvedValueOnce(CUSTOMER_DETAIL)
      .mockResolvedValueOnce([]);

    const page = await CustomerDetailPage(makeProps());
    render(page);

    const backLink = screen.getByRole("link", { name: /顧客一覧/ });
    expect(backLink).toHaveAttribute("href", "/business/customers");
  });
});
