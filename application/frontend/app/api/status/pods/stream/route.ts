/**
 * GET /api/status/pods/stream — 認証不要の SSE ストリーム
 * k8s watch API（NDJSON）を Server-Sent Events に変換してブラウザへ流す。
 * クライアント切断時は reader をキャンセルしてリソースを解放する。
 */

import type { NextRequest } from "next/server";
import { watchPods } from "@/lib/k8s";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of watchPods("technomart", req.signal)) {
          if (req.signal.aborted) break;

          const line = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(line));
        }
      } catch (e) {
        // クライアント切断による AbortError は正常終了
        if (e instanceof Error && e.name === "AbortError") return;
        // その他のエラーは SSE エラーイベントとして通知してから終了
        const errLine = `event: error\ndata: ${JSON.stringify({ message: String(e) })}\n\n`;
        controller.enqueue(encoder.encode(errLine));
      } finally {
        controller.close();
      }
    },
    cancel() {
      // ReadableStream が閉じられたとき（クライアント切断）は watchPods 側が
      // req.signal で検知するため、ここでは何もしない
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",    // Nginx プロキシのバッファリング無効化
      "retry": "3000",              // ブラウザ自動再接続間隔（ms）
    },
  });
}
