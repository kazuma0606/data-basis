import Link from "next/link";
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
import { statusVariant, formatDatetime } from "@/lib/status";
import type { CustomerDetail, ProductRecommendation } from "@/lib/types";

export const dynamic = "force-dynamic";

const CHURN_LABEL: Record<string, string> = {
  active:  "アクティブ",
  dormant: "休眠",
  churned: "チャーン",
};

const SCORE_LABEL: Record<string, string> = {
  affinity_score:      "カテゴリ親和性",
  churn_risk_score:    "チャーンリスク",
  visit_predict_score: "来店予測",
  timing_score:        "購買タイミング",
};

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CustomerDetailPage({ params }: Props) {
  const { id } = await params;

  let customer: CustomerDetail | null = null;
  let recommendations: ProductRecommendation[] = [];
  let fetchError: string | null = null;

  try {
    [customer, recommendations] = await Promise.all([
      apiFetch<CustomerDetail>(`/business/customers/${id}`),
      apiFetch<ProductRecommendation[]>(`/business/customers/${id}/recommendations`).catch(() => []),
    ]);
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "取得に失敗しました";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/business/customers"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← 顧客一覧
        </Link>
        <span className="text-muted-foreground">/</span>
        <h1 className="text-2xl font-semibold text-foreground">
          {customer?.canonical_name ?? `顧客 #${id}`}
        </h1>
      </div>

      {fetchError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {fetchError}
        </div>
      )}

      {customer && (
        <>
          {/* 基本情報 */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">基本情報</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">ID</dt>
                  <dd className="text-foreground mt-0.5">{customer.unified_id}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">氏名</dt>
                  <dd className="text-foreground mt-0.5">{customer.canonical_name}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">メール</dt>
                  <dd className="text-foreground mt-0.5">{customer.email ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">電話番号</dt>
                  <dd className="text-foreground mt-0.5">{customer.phone ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">生年月日</dt>
                  <dd className="text-foreground mt-0.5">{customer.birth_date ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">都道府県</dt>
                  <dd className="text-foreground mt-0.5">{customer.prefecture ?? "—"}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {/* チャーンラベル */}
          {customer.churn_label && (
            <Card className="border-border bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">チャーンステータス</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 text-sm">
                  <Badge variant={statusVariant(customer.churn_label.label)}>
                    {CHURN_LABEL[customer.churn_label.label] ?? customer.churn_label.label}
                  </Badge>
                  <span className="text-muted-foreground">
                    最終購買:{" "}
                    {customer.churn_label.last_purchase_at
                      ? formatDatetime(customer.churn_label.last_purchase_at)
                      : "—"}
                  </span>
                  {customer.churn_label.days_since_purchase != null && (
                    <span className="text-muted-foreground">
                      ({customer.churn_label.days_since_purchase} 日前)
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* スコア */}
          {customer.scores.length > 0 && (
            <Card className="border-border bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">スコア</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="text-muted-foreground">カテゴリID</TableHead>
                      {Object.values(SCORE_LABEL).map((label) => (
                        <TableHead key={label} className="text-muted-foreground text-right">
                          {label}
                        </TableHead>
                      ))}
                      <TableHead className="text-muted-foreground">更新日時</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customer.scores.map((score) => (
                      <TableRow key={score.category_id} className="border-border">
                        <TableCell className="text-sm text-muted-foreground">
                          cat_{score.category_id}
                        </TableCell>
                        <TableCell className="text-sm text-right font-mono">
                          {score.affinity_score.toFixed(3)}
                        </TableCell>
                        <TableCell className="text-sm text-right font-mono">
                          {score.churn_risk_score.toFixed(3)}
                        </TableCell>
                        <TableCell className="text-sm text-right font-mono">
                          {score.visit_predict_score.toFixed(3)}
                        </TableCell>
                        <TableCell className="text-sm text-right font-mono">
                          {score.timing_score.toFixed(3)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDatetime(score.updated_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* レコメンデーション */}
          {recommendations.length > 0 && (
            <Card className="border-border bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">おすすめ商品</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="text-muted-foreground">商品名</TableHead>
                      <TableHead className="text-muted-foreground">ブランド</TableHead>
                      <TableHead className="text-muted-foreground text-right">価格</TableHead>
                      <TableHead className="text-muted-foreground text-right">類似度</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recommendations.map((rec) => (
                      <TableRow key={rec.unified_product_id} className="border-border">
                        <TableCell className="text-sm text-foreground">{rec.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {rec.brand ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm text-right font-mono">
                          {rec.price != null ? `¥${rec.price.toLocaleString("ja-JP")}` : "—"}
                        </TableCell>
                        <TableCell className="text-sm text-right font-mono text-primary">
                          {rec.similarity.toFixed(3)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
