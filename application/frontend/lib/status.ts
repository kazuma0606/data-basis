/** ステータス文字列に対応する Badge の className を返す */
export function statusVariant(
  status: string
): "default" | "secondary" | "destructive" | "outline" {
  const s = status.toLowerCase();
  if (["healthy", "ok", "completed", "success", "active"].includes(s)) return "default";
  if (["running", "in_progress"].includes(s)) return "secondary";
  if (["error", "failed", "unhealthy"].includes(s)) return "destructive";
  return "outline";
}

/** ステータス文字列を日本語ラベルに変換 */
export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    healthy: "正常",
    ok: "正常",
    completed: "完了",
    success: "成功",
    active: "稼働中",
    running: "実行中",
    in_progress: "処理中",
    error: "エラー",
    failed: "失敗",
    unhealthy: "異常",
    warning: "警告",
    pending: "待機中",
    stable: "安定",
  };
  return map[status.toLowerCase()] ?? status;
}

/** ISO datetime 文字列を日本語表示にフォーマット */
export function formatDatetime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 処理件数を "1,234 件" 形式にフォーマット */
export function formatCount(n: number | null): string {
  if (n == null) return "—";
  return `${n.toLocaleString("ja-JP")} 件`;
}

/** 秒数を "mm:ss" 形式にフォーマット */
export function formatDuration(startedAt: string, finishedAt: string | null): string {
  if (!finishedAt) return "—";
  const sec = Math.round(
    (new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000
  );
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
