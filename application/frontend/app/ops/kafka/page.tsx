"use client";

import useSWR from "swr";
import { RefreshCw } from "lucide-react";
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
import type { TopicInfo } from "@/lib/types";

const POLL_INTERVAL = 30_000; // 30秒

async function fetcher(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("取得に失敗しました");
  return res.json();
}

export default function KafkaPage() {
  const {
    data: topics,
    error,
    isLoading,
    isValidating,
  } = useSWR<TopicInfo[]>("/api/ops/kafka/topics", fetcher, {
    refreshInterval: POLL_INTERVAL,
    revalidateOnFocus: false,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Kafka モニタリング</h1>
          <p className="text-sm text-muted-foreground mt-1">
            トピック一覧（30秒ごとに自動更新）
          </p>
        </div>
        {isValidating && !isLoading && (
          <RefreshCw className="h-4 w-4 text-muted-foreground animate-spin" aria-label="更新中" />
        )}
      </div>

      {/* サマリカード */}
      {topics && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-border bg-card">
            <CardContent className="pt-5">
              <p className="text-2xl font-bold text-foreground">{topics.length}</p>
              <p className="text-xs text-muted-foreground mt-1">トピック数</p>
            </CardContent>
          </Card>
          <Card className="border-border bg-card">
            <CardContent className="pt-5">
              <p className="text-2xl font-bold text-foreground">
                {topics.reduce((s, t) => s + t.partitions, 0)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">総パーティション数</p>
            </CardContent>
          </Card>
          <Card className="border-border bg-card">
            <CardContent className="pt-5">
              <p className="text-2xl font-bold text-foreground">
                {topics.reduce((s, t) => s + t.message_count, 0).toLocaleString("ja-JP")}
              </p>
              <p className="text-xs text-muted-foreground mt-1">総メッセージ数</p>
            </CardContent>
          </Card>
          <Card className="border-border bg-card">
            <CardContent className="pt-5">
              <p className="text-2xl font-bold text-primary">稼働中</p>
              <p className="text-xs text-muted-foreground mt-1">ブローカー状態</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* エラー */}
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error.message}
        </div>
      )}

      {/* トピック一覧テーブル */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">トピック一覧</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">
              読み込み中...
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">トピック名</TableHead>
                  <TableHead className="text-muted-foreground text-right">
                    パーティション数
                  </TableHead>
                  <TableHead className="text-muted-foreground text-right">
                    メッセージ数
                  </TableHead>
                  <TableHead className="text-muted-foreground">状態</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topics && topics.length > 0 ? (
                  topics.map((topic) => (
                    <TableRow key={topic.name} className="border-border">
                      <TableCell className="font-mono text-sm text-foreground">
                        {topic.name}
                      </TableCell>
                      <TableCell className="text-right text-foreground">
                        {topic.partitions}
                      </TableCell>
                      <TableCell className="text-right text-foreground">
                        {topic.message_count.toLocaleString("ja-JP")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="default">稼働中</Badge>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center text-muted-foreground py-8"
                    >
                      トピックが見つかりません
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
