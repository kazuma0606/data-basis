import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SalesChart } from "@/components/business/SalesChart";
import type { KpiSummary, SalesByChannel } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SummaryPage() {
  const [kpi, sales] = await Promise.allSettled([
    apiFetch<KpiSummary>("/business/summary"),
    apiFetch<SalesByChannel[]>("/business/analytics/sales?days=30"),
  ]);

  const kpiData  = kpi.status  === "fulfilled" ? kpi.value  : null;
  const salesData = sales.status === "fulfilled" ? sales.value : [];
  const kpiError  = kpi.status  === "rejected"  ? String(kpi.reason)  : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">ビジネスサマリ</h1>
        <p className="text-sm text-muted-foreground mt-1">顧客KPI・売上サマリ</p>
      </div>

      {kpiError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {kpiError}
        </div>
      )}

      {/* KPIカード */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="border-border bg-card">
          <CardContent className="pt-5">
            <p className="text-2xl font-bold text-foreground">
              {kpiData?.active_customers.toLocaleString("ja-JP") ?? "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">アクティブ顧客</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="pt-5">
            <p className="text-2xl font-bold text-foreground">
              {kpiData?.dormant_customers.toLocaleString("ja-JP") ?? "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">休眠顧客</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="pt-5">
            <p className="text-2xl font-bold text-destructive">
              {kpiData?.churned_customers.toLocaleString("ja-JP") ?? "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">チャーン顧客</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="pt-5">
            <p className="text-2xl font-bold text-foreground">
              {kpiData != null ? `${(kpiData.churn_rate * 100).toFixed(1)}%` : "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">チャーン率</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="pt-5">
            <p className="text-2xl font-bold text-primary">
              {kpiData != null
                ? `¥${kpiData.weekly_revenue.toLocaleString("ja-JP")}`
                : "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">週次売上</p>
          </CardContent>
        </Card>
      </div>

      {/* 売上推移チャート */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">チャネル別売上（直近30日）</CardTitle>
        </CardHeader>
        <CardContent>
          <SalesChart data={salesData} />
        </CardContent>
      </Card>
    </div>
  );
}
