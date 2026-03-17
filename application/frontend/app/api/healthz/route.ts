/**
 * GET /api/healthz — 認証不要のヘルスチェックエンドポイント
 * Prometheus scrape や外部監視ツール向け。
 * k8s API が壊れていても nextjs: "ok" を常に返す。
 */

import { NextResponse } from "next/server";
import { getClusterHealth } from "@/lib/k8s";

export const dynamic = "force-dynamic";

export async function GET() {
  const k8sHealth = await getClusterHealth();

  const body = {
    nextjs: "ok" as const,
    ...k8sHealth,
  };

  return NextResponse.json(body, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
