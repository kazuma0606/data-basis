import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  statusVariant,
  statusLabel,
  formatDatetime,
  formatCount,
  formatDuration,
} from "@/lib/status";
import type { BatchInfo } from "@/lib/types";

export const dynamic = "force-dynamic";

/** バッチ種別の日本語ラベル */
const BATCH_TYPE_LABEL: Record<string, string> = {
  churn_risk: "チャーンリスク",
  category_affinity: "カテゴリ親和性",
  purchase_timing: "購買タイミング",
  visit_prediction: "来店予測",
};

export default async function ScoringPage() {
  let batches: BatchInfo[] = [];
  let fetchError: string | null = null;

  try {
    batches = await apiFetch<BatchInfo[]>("/ops/scoring/batches");
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "取得に失敗しました";
  }

  const lastCompleted = batches.find((b) => b.status === "completed");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">スコアリングバッチ</h1>
        <p className="text-sm text-muted-foreground mt-1">
          バッチ実行履歴・最終実行日時・次回予定
        </p>
      </div>

      {fetchError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {fetchError}
        </div>
      )}

      {/* サマリ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border bg-card">
          <CardContent className="pt-5">
            <p className="text-2xl font-bold text-foreground">{batches.length}</p>
            <p className="text-xs text-muted-foreground mt-1">総バッチ数</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="pt-5">
            <p className="text-2xl font-bold text-foreground">
              {batches.filter((b) => b.status === "completed").length}
            </p>
            <p className="text-xs text-muted-foreground mt-1">正常完了</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="pt-5">
            <p className="text-sm font-medium text-foreground">
              {formatDatetime(lastCompleted?.finished_at ?? null)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">最終実行完了</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="pt-5">
            <p className="text-sm font-medium text-foreground">
              {formatDatetime(batches[0]?.next_run_at ?? null)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">次回予定</p>
          </CardContent>
        </Card>
      </div>

      {/* バッチ履歴テーブル */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">バッチ実行履歴</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">バッチ種別</TableHead>
                <TableHead className="text-muted-foreground">ステータス</TableHead>
                <TableHead className="text-muted-foreground">開始日時</TableHead>
                <TableHead className="text-muted-foreground text-right">処理件数</TableHead>
                <TableHead className="text-muted-foreground text-right">実行時間</TableHead>
                <TableHead className="text-muted-foreground">次回予定</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.length > 0 ? (
                batches.map((batch) => (
                  <TableRow key={batch.id} className="border-border">
                    <TableCell className="text-sm text-foreground font-medium">
                      {BATCH_TYPE_LABEL[batch.batch_type] ?? batch.batch_type}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(batch.status)}>
                        {statusLabel(batch.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDatetime(batch.started_at)}
                    </TableCell>
                    <TableCell className="text-sm text-right text-foreground">
                      {formatCount(batch.records_processed)}
                    </TableCell>
                    <TableCell className="text-sm text-right text-foreground">
                      {formatDuration(batch.started_at, batch.finished_at)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDatetime(batch.next_run_at)}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-muted-foreground py-8"
                  >
                    {fetchError ? "—" : "バッチ履歴がありません"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
