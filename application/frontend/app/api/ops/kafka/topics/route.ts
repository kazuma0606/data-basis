import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";
import type { TopicInfo } from "@/lib/types";

/** Kafka トピック一覧 — SWR クライアントポーリング用プロキシ */
export async function GET() {
  try {
    const data = await apiFetch<TopicInfo[]>("/ops/kafka/topics");
    return NextResponse.json(data);
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    const message = err instanceof Error ? err.message : "エラーが発生しました";
    return NextResponse.json({ error: message }, { status });
  }
}
