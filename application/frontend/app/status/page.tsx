/**
 * /status — Pod 監視ページ（認証不要）
 * クラスター概要 / デプロイバージョン / リアルタイム Pod グリッド
 */

import { Suspense } from "react";
import { getClusterHealth } from "@/lib/k8s";
import { DeployVersions } from "@/components/status/DeployVersions";
import { PodGrid } from "@/components/status/PodGrid";
import { Separator } from "@/components/ui/separator";

export const dynamic = "force-dynamic";

export default async function StatusPage() {
  const health = await getClusterHealth();

  const pods = health.pods ?? { running: 0, pending: 0, failed: 0, unknown: 0 };
  const total = pods.running + pods.pending + pods.failed + pods.unknown;
  const k8sOk = health.k8s_api === "ok";

  return (
    <main className="min-h-screen bg-background p-6 space-y-8">
      {/* ── ヘッダー ── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">クラスター状態</h1>
        <p className="text-muted-foreground text-sm mt-1">
          TechnoMart k8s クラスター — リアルタイム Pod 監視
        </p>
      </div>

      {/* ── クラスター概要バー ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 rounded-lg border p-4 bg-muted/30">
        <div>
          <div className="text-xs text-muted-foreground">k8s API</div>
          <div className={`font-semibold ${k8sOk ? "text-green-600" : "text-destructive"}`}>
            {k8sOk ? "OK" : "ERROR"}
          </div>
          {!k8sOk && health.k8s_error && (
            <div className="text-xs text-destructive">{health.k8s_error}</div>
          )}
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Total Pods</div>
          <div className="font-semibold">{total}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Running</div>
          <div className="font-semibold text-green-600">{pods.running}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Pending</div>
          <div className="font-semibold text-yellow-600">{pods.pending}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Failed</div>
          <div className={`font-semibold ${pods.failed > 0 ? "text-destructive" : ""}`}>
            {pods.failed}
          </div>
        </div>
      </div>

      <Separator />

      {/* ── デプロイバージョン ── */}
      <Suspense fallback={<p className="text-sm text-muted-foreground">バージョン情報を読み込み中...</p>}>
        <DeployVersions />
      </Suspense>

      <Separator />

      {/* ── Pod グリッド（リアルタイム） ── */}
      <PodGrid />
    </main>
  );
}
