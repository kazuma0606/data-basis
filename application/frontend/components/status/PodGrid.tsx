"use client";

import { useEffect, useReducer, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PodInfo, PodEvent } from "@/lib/types";

// ── ステータス色分け ────────────────────────────────────────────

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

function getStatusVariant(status: string): BadgeVariant {
  const s = status.toLowerCase();
  if (s === "running") return "default";
  if (s === "pending" || s === "containercreating") return "secondary";
  if (["error", "crashloopbackoff", "oomkilled", "failed"].some((x) => s.includes(x)))
    return "destructive";
  return "outline";
}

// ── Pod リスト reducer ────────────────────────────────────────

type State = Map<string, PodInfo>;
type Action = PodEvent;

function reducer(state: State, action: Action): State {
  const next = new Map(state);
  switch (action.type) {
    case "ADDED":
    case "MODIFIED":
      next.set(action.pod.name, action.pod);
      break;
    case "DELETED":
      next.delete(action.pod.name);
      break;
  }
  return next;
}

// ── コンポーネント ─────────────────────────────────────────────

export function PodGrid() {
  const [pods, dispatch] = useReducer(reducer, new Map<string, PodInfo>());
  const connected = useRef(false);
  const statusLabel = connected.current ? "● Connected" : "○ Reconnecting...";

  useEffect(() => {
    let es: EventSource;

    function connect() {
      es = new EventSource("/api/status/pods/stream");

      es.onopen = () => {
        connected.current = true;
      };

      es.onmessage = (e) => {
        try {
          const event: PodEvent = JSON.parse(e.data);
          dispatch(event);
        } catch {
          // 不正な JSON はスキップ
        }
      };

      es.onerror = () => {
        connected.current = false;
        es.close();
        // retry ディレクティブによりブラウザが自動再接続するが、
        // EventSource インスタンスを再生成して確実に再接続する
        setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      es?.close();
    };
  }, []);

  const podList = Array.from(pods.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Pod 一覧</h2>
        <span className="text-xs text-muted-foreground">{statusLabel}</span>
      </div>

      {podList.length === 0 ? (
        <p className="text-sm text-muted-foreground">Pod 情報を取得中...</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {podList.map((pod) => (
            <Card key={pod.name} className="text-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-mono truncate" title={pod.name}>
                  {pod.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant={getStatusVariant(pod.status)}>{pod.status}</Badge>
                </div>
                <div className="text-muted-foreground grid grid-cols-3 gap-x-2">
                  <span>READY</span>
                  <span>RESTARTS</span>
                  <span>AGE</span>
                  <span className="font-mono">{pod.ready}</span>
                  <span className="font-mono">{pod.restarts}</span>
                  <span className="font-mono">{pod.age}</span>
                </div>
                <div className="font-mono text-xs text-muted-foreground truncate" title={pod.image}>
                  {pod.image}
                </div>
                {pod.message && (
                  <div className="text-xs text-destructive truncate" title={pod.message}>
                    {pod.message}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
