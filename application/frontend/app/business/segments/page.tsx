import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SegmentPieChart, SegmentTrendChart } from "@/components/business/SegmentsChart";
import type { SegmentSummary, SegmentTrend } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SegmentsPage() {
  const [summaryRes, trendRes] = await Promise.allSettled([
    apiFetch<SegmentSummary[]>("/business/analytics/segments"),
    apiFetch<SegmentTrend[]>("/business/analytics/segments/trend"),
  ]);

  const summaryData = summaryRes.status === "fulfilled" ? summaryRes.value : [];
  const trendData   = trendRes.status   === "fulfilled" ? trendRes.value   : [];
  const error =
    summaryRes.status === "rejected" ? String(summaryRes.reason) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">セグメント分析</h1>
        <p className="text-sm text-muted-foreground mt-1">顧客セグメント構成・推移</p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">セグメント構成</CardTitle>
          </CardHeader>
          <CardContent>
            <SegmentPieChart data={summaryData} />
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">セグメント推移（週次）</CardTitle>
          </CardHeader>
          <CardContent>
            <SegmentTrendChart data={trendData} />
          </CardContent>
        </Card>
      </div>

      {summaryData.length > 0 && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">セグメント詳細</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3 text-muted-foreground font-medium">セグメント</th>
                  <th className="text-right p-3 text-muted-foreground font-medium">顧客数</th>
                  <th className="text-right p-3 text-muted-foreground font-medium">割合</th>
                </tr>
              </thead>
              <tbody>
                {summaryData.map((seg) => (
                  <tr key={seg.label} className="border-b border-border last:border-0">
                    <td className="p-3 text-foreground">{seg.label}</td>
                    <td className="p-3 text-right font-mono text-foreground">
                      {seg.count.toLocaleString("ja-JP")}
                    </td>
                    <td className="p-3 text-right font-mono text-muted-foreground">
                      {seg.percentage.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
