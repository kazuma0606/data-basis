import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AffinityHeatmap } from "@/components/business/AffinityHeatmap";
import type { CategoryAffinity } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AffinityPage() {
  let data: CategoryAffinity[] = [];
  let fetchError: string | null = null;

  try {
    data = await apiFetch<CategoryAffinity[]>("/business/analytics/affinity");
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "取得に失敗しました";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">カテゴリ親和性</h1>
        <p className="text-sm text-muted-foreground mt-1">年齢層 × カテゴリ別の親和性スコア</p>
      </div>

      {fetchError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {fetchError}
        </div>
      )}

      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">親和性ヒートマップ</CardTitle>
        </CardHeader>
        <CardContent>
          <AffinityHeatmap data={data} />
        </CardContent>
      </Card>
    </div>
  );
}
