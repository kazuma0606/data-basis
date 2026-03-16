import { render, screen } from "@testing-library/react";
import CustomersPage from "@/app/business/customers/page";

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

const CUSTOMERS = [
  { unified_id: 1, canonical_name: "山田太郎", email: "yamada@example.com", phone: "090-1234-5678", prefecture: "東京都", churn_label: "active" },
  { unified_id: 2, canonical_name: "鈴木花子", email: null, phone: null, prefecture: "大阪府", churn_label: "dormant" },
  { unified_id: 3, canonical_name: "田中一郎", email: "tanaka@example.com", phone: null, prefecture: null, churn_label: "churned" },
];

function makeProps(offset = 0) {
  return { searchParams: Promise.resolve({ offset: String(offset) }) };
}

describe("CustomersPage", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders customer table with names", async () => {
    mockApiFetch.mockResolvedValueOnce({ items: CUSTOMERS, total: 3, offset: 0, limit: 20 });

    const page = await CustomersPage(makeProps());
    render(page);

    expect(screen.getByText("山田太郎")).toBeInTheDocument();
    expect(screen.getByText("鈴木花子")).toBeInTheDocument();
    expect(screen.getByText("田中一郎")).toBeInTheDocument();
  });

  it("renders churn labels as Japanese badges", async () => {
    mockApiFetch.mockResolvedValueOnce({ items: CUSTOMERS, total: 3, offset: 0, limit: 20 });

    const page = await CustomersPage(makeProps());
    render(page);

    expect(screen.getByText("アクティブ")).toBeInTheDocument();
    expect(screen.getByText("休眠")).toBeInTheDocument();
    expect(screen.getByText("チャーン")).toBeInTheDocument();
  });

  it("shows total count", async () => {
    mockApiFetch.mockResolvedValueOnce({ items: CUSTOMERS, total: 100, offset: 0, limit: 20 });

    const page = await CustomersPage(makeProps());
    render(page);

    expect(screen.getByText(/全 100 件/)).toBeInTheDocument();
  });

  it("shows customer detail links", async () => {
    mockApiFetch.mockResolvedValueOnce({ items: CUSTOMERS, total: 3, offset: 0, limit: 20 });

    const page = await CustomersPage(makeProps());
    render(page);

    const link = screen.getByRole("link", { name: "山田太郎" });
    expect(link).toHaveAttribute("href", "/business/customers/1");
  });

  it("shows error message on fetch failure", async () => {
    mockApiFetch.mockRejectedValueOnce(new Error("API エラー"));

    const page = await CustomersPage(makeProps());
    render(page);

    expect(screen.getByText(/API エラー/)).toBeInTheDocument();
  });

  it("shows empty state when no customers", async () => {
    mockApiFetch.mockResolvedValueOnce({ items: [], total: 0, offset: 0, limit: 20 });

    const page = await CustomersPage(makeProps());
    render(page);

    expect(screen.getByText("顧客が見つかりません")).toBeInTheDocument();
  });

  it("uses offset from searchParams", async () => {
    mockApiFetch.mockResolvedValueOnce({ items: [], total: 100, offset: 20, limit: 20 });

    const page = await CustomersPage(makeProps(20));
    render(page);

    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining("offset=20")
    );
  });
});
