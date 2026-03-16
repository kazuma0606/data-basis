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
import type { TableSchema } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SchemaPage() {
  let tables: TableSchema[] = [];
  let fetchError: string | null = null;

  try {
    tables = await apiFetch<TableSchema[]>("/ops/schema/tables");
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "取得に失敗しました";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">スキーマ参照</h1>
        <p className="text-sm text-muted-foreground mt-1">
          テーブル定義一覧（カラム名・型・NULL制約）
        </p>
      </div>

      {fetchError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {fetchError}
        </div>
      )}

      <div className="space-y-4">
        {tables.length > 0 ? (
          tables.map((table) => (
            <Card key={table.table_name} className="border-border bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-3">
                  <span className="font-mono">{table.table_name}</span>
                  <Badge variant="outline" className="text-xs">
                    {table.columns.length} カラム
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="text-muted-foreground">カラム名</TableHead>
                      <TableHead className="text-muted-foreground">型</TableHead>
                      <TableHead className="text-muted-foreground">NULL</TableHead>
                      <TableHead className="text-muted-foreground">デフォルト</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {table.columns.map((col) => (
                      <TableRow key={col.name} className="border-border">
                        <TableCell className="font-mono text-sm text-foreground">
                          {col.name}
                        </TableCell>
                        <TableCell className="font-mono text-sm text-primary">
                          {col.data_type}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={col.nullable ? "outline" : "secondary"}
                            className="text-xs"
                          >
                            {col.nullable ? "NULL" : "NOT NULL"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground font-mono">
                          {col.default ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))
        ) : (
          !fetchError && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              テーブルが見つかりません
            </div>
          )
        )}
      </div>
    </div>
  );
}
