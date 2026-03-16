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
import type { JobInfo } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  let jobs: JobInfo[] = [];
  let fetchError: string | null = null;

  try {
    jobs = await apiFetch<JobInfo[]>("/ops/pipeline/jobs");
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "取得に失敗しました";
  }

  const completedJobs = jobs.filter((j) => j.status === "completed");
  const failedJobs = jobs.filter((j) => j.status === "failed");
  const runningJobs = jobs.filter((j) => j.status === "running");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">パイプライン実行履歴</h1>
        <p className="text-sm text-muted-foreground mt-1">
          ETLジョブの実行状態・処理件数・実行時間
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
            <p className="text-2xl font-bold text-foreground">{jobs.length}</p>
            <p className="text-xs text-muted-foreground mt-1">総ジョブ数</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="pt-5">
            <p className="text-2xl font-bold text-foreground">{completedJobs.length}</p>
            <p className="text-xs text-muted-foreground mt-1">完了</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="pt-5">
            <p className="text-2xl font-bold text-destructive">{failedJobs.length}</p>
            <p className="text-xs text-muted-foreground mt-1">失敗</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="pt-5">
            <p className="text-2xl font-bold text-primary">{runningJobs.length}</p>
            <p className="text-xs text-muted-foreground mt-1">実行中</p>
          </CardContent>
        </Card>
      </div>

      {/* ジョブ履歴テーブル */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">ジョブ一覧</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">ジョブ名</TableHead>
                <TableHead className="text-muted-foreground">ステータス</TableHead>
                <TableHead className="text-muted-foreground">開始日時</TableHead>
                <TableHead className="text-muted-foreground text-right">処理件数</TableHead>
                <TableHead className="text-muted-foreground text-right">実行時間</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.length > 0 ? (
                jobs.map((job) => (
                  <TableRow key={job.id} className="border-border">
                    <TableCell className="text-sm text-foreground font-medium">
                      {job.job_name}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(job.status)}>
                        {statusLabel(job.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDatetime(job.started_at)}
                    </TableCell>
                    <TableCell className="text-sm text-right text-foreground">
                      {formatCount(job.records_processed)}
                    </TableCell>
                    <TableCell className="text-sm text-right text-foreground">
                      {formatDuration(job.started_at, job.finished_at)}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground py-8"
                  >
                    {fetchError ? "—" : "ジョブ履歴がありません"}
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
