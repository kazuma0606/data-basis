import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";
import type { NLQueryResponse } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { query: string };
    if (!body.query?.trim()) {
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    }

    const result = await apiFetch<NLQueryResponse>("/business/query", {
      method: "POST",
      body: JSON.stringify({ query: body.query }),
    });

    return NextResponse.json({ query: result.query, answer: result.answer });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
