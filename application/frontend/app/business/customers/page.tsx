import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { statusVariant } from "@/lib/status";
import type { CustomerListResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

const CHURN_LABEL: Record<string, string> = {
  active:  "アクティブ",
  dormant: "休眠",
  churned: "チャーン",
};

interface Props {
  searchParams: Promise<{ offset?: string }>;
}

export default async function CustomersPage({ searchParams }: Props) {
  const params = await searchParams;
  const offset = Math.max(0, parseInt(params.offset ?? "0", 10));

  let result: CustomerListResponse | null = null;
  let fetchError: string | null = null;

  try {
    result = await apiFetch<CustomerListResponse>(
      `/business/customers?offset=${offset}&limit=${PAGE_SIZE}`
    );
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "取得に失敗しました";
  }

  const total = result?.total ?? 0;
  const items = result?.items ?? [];
  const hasPrev = offset > 0;
  const hasNext = offset + PAGE_SIZE < total;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">顧客一覧</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {total > 0 ? `全 ${total.toLocaleString("ja-JP")} 件` : ""}
          </p>
        </div>
      </div>

      {fetchError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {fetchError}
        </div>
      )}

      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} 件目 / 全 {total.toLocaleString("ja-JP")} 件
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">ID</TableHead>
                <TableHead className="text-muted-foreground">氏名</TableHead>
                <TableHead className="text-muted-foreground">メール</TableHead>
                <TableHead className="text-muted-foreground">都道府県</TableHead>
                <TableHead className="text-muted-foreground">チャーンラベル</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length > 0 ? (
                items.map((customer) => (
                  <TableRow key={customer.unified_id} className="border-border">
                    <TableCell className="text-sm text-muted-foreground">
                      {customer.unified_id}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/business/customers/${customer.unified_id}`}
                        className="text-sm text-primary hover:underline font-medium"
                      >
                        {customer.canonical_name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {customer.email ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-foreground">
                      {customer.prefecture ?? "—"}
                    </TableCell>
                    <TableCell>
                      {customer.churn_label ? (
                        <Badge variant={statusVariant(customer.churn_label)}>
                          {CHURN_LABEL[customer.churn_label] ?? customer.churn_label}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    {fetchError ? "—" : "顧客が見つかりません"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ページネーション */}
      {total > PAGE_SIZE && (
        <div className="flex justify-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={!hasPrev}
            asChild={hasPrev}
          >
            {hasPrev ? (
              <Link href={`/business/customers?offset=${Math.max(0, offset - PAGE_SIZE)}`}>
                前へ
              </Link>
            ) : (
              <span>前へ</span>
            )}
          </Button>
          <span className="text-sm text-muted-foreground self-center">
            {Math.floor(offset / PAGE_SIZE) + 1} / {Math.ceil(total / PAGE_SIZE)} ページ
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!hasNext}
            asChild={hasNext}
          >
            {hasNext ? (
              <Link href={`/business/customers?offset=${offset + PAGE_SIZE}`}>
                次へ
              </Link>
            ) : (
              <span>次へ</span>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
