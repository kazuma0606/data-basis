import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { statusVariant, statusLabel } from "@/lib/status";
import type { HealthResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function OpsOverviewPage() {
  let health: HealthResponse | null = null;
  let fetchError: string | null = null;

  try {
    health = await apiFetch<HealthResponse>("/ops/health");
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "取得に失敗しました";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">システム概要</h1>
        <p className="text-sm text-muted-foreground mt-1">
          各サービスのヘルスチェック状態
        </p>
      </div>

      {/* 全体ステータス */}
      {health && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-3">
              全体ステータス
              <Badge variant={statusVariant(health.overall)}>
                {statusLabel(health.overall)}
              </Badge>
            </CardTitle>
          </CardHeader>
        </Card>
      )}

      {/* エラー表示 */}
      {fetchError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {fetchError}
        </div>
      )}

      {/* サービス一覧 */}
      {health ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {health.services.map((svc) => (
            <Card key={svc.name} className="border-border bg-card">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground capitalize">
                    {svc.name}
                  </span>
                  <Badge variant={statusVariant(svc.status)}>
                    {statusLabel(svc.status)}
                  </Badge>
                </div>
                {svc.error && (
                  <p className="mt-2 text-xs text-destructive truncate" title={svc.error}>
                    {svc.error}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        !fetchError && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="border-border bg-card animate-pulse">
                <CardContent className="pt-5 pb-4 h-16" />
              </Card>
            ))}
          </div>
        )
      )}
    </div>
  );
}
