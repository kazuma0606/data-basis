"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Database, Key, Link2 } from "lucide-react"

const sourceSchemas = {
  ec: {
    name: "ECシステム",
    description: "2015年構築、MySQL相当",
    tables: [
      {
        name: "ec_customers",
        description: "EC顧客マスタ（バウンス・退会済みも残存）",
        columns: [
          { name: "ec_user_id", type: "SERIAL", pk: true, description: "主キー" },
          { name: "email", type: "VARCHAR", description: "メールアドレス" },
          { name: "name_kanji", type: "VARCHAR", description: "漢字氏名" },
          { name: "name_kana", type: "VARCHAR", description: "カナ氏名（未入力多い）" },
          { name: "birth_date", type: "DATE", description: "生年月日（西暦）" },
          { name: "phone", type: "VARCHAR", description: "電話番号（フォーマット不統一）" },
          { name: "prefecture", type: "VARCHAR", description: "都道府県（混在あり）" },
          { name: "registered_at", type: "TIMESTAMP", description: "登録日時" },
          { name: "is_deleted", type: "BOOLEAN", description: "退会フラグ" },
        ],
      },
      {
        name: "ec_browsing_events",
        description: "EC閲覧イベント",
        columns: [
          { name: "event_id", type: "BIGSERIAL", pk: true, description: "主キー" },
          { name: "ec_user_id", type: "INT", fk: "ec_customers", description: "顧客ID" },
          { name: "session_id", type: "VARCHAR", description: "セッションID" },
          { name: "ec_product_id", type: "INT", fk: "ec_products", description: "商品ID" },
          { name: "event_type", type: "VARCHAR", description: "イベント種別" },
          { name: "event_value", type: "VARCHAR", description: "イベント値" },
          { name: "timestamp", type: "TIMESTAMP", description: "発生日時" },
        ],
      },
      {
        name: "ec_orders",
        description: "EC注文",
        columns: [
          { name: "order_id", type: "SERIAL", pk: true, description: "主キー" },
          { name: "ec_user_id", type: "INT", fk: "ec_customers", description: "顧客ID" },
          { name: "ordered_at", type: "TIMESTAMP", description: "注文日時" },
          { name: "total_amount", type: "INT", description: "合計金額" },
          { name: "status", type: "VARCHAR", description: "ステータス" },
        ],
      },
    ],
  },
  pos: {
    name: "POSシステム",
    description: "2008年導入、SQL Server相当",
    tables: [
      {
        name: "pos_members",
        description: "POS会員（氏名はカナのみ、生年月日は和暦）",
        columns: [
          { name: "member_id", type: "SERIAL", pk: true, description: "主キー" },
          { name: "name_kana", type: "VARCHAR", description: "カナ氏名（漢字なし）" },
          { name: "birth_date_jp", type: "VARCHAR", description: "和暦生年月日" },
          { name: "phone", type: "VARCHAR", description: "電話番号" },
          { name: "registered_at", type: "TIMESTAMP", description: "登録日時" },
        ],
      },
      {
        name: "pos_transactions",
        description: "POS取引",
        columns: [
          { name: "transaction_id", type: "SERIAL", pk: true, description: "主キー" },
          { name: "member_id", type: "INT", fk: "pos_members", description: "会員ID（非会員はNULL）" },
          { name: "store_id", type: "INT", fk: "master_stores", description: "店舗ID" },
          { name: "transacted_at", type: "TIMESTAMP", description: "取引日時" },
          { name: "total_amount", type: "INT", description: "合計金額" },
        ],
      },
    ],
  },
  app: {
    name: "会員アプリ",
    description: "2021年構築、PostgreSQL相当",
    tables: [
      {
        name: "app_users",
        description: "アプリユーザー（電話番号ベース）",
        columns: [
          { name: "uid", type: "VARCHAR", pk: true, description: "UUID" },
          { name: "phone", type: "VARCHAR", description: "電話番号（名寄せキー）" },
          { name: "name", type: "VARCHAR", description: "氏名" },
          { name: "registered_at", type: "TIMESTAMP", description: "登録日時" },
          { name: "push_enabled", type: "BOOLEAN", description: "プッシュ通知許可" },
        ],
      },
      {
        name: "app_events",
        description: "アプリ行動イベント",
        columns: [
          { name: "event_id", type: "BIGSERIAL", pk: true, description: "主キー" },
          { name: "uid", type: "VARCHAR", fk: "app_users", description: "ユーザーUID" },
          { name: "event_type", type: "VARCHAR", description: "イベント種別" },
          { name: "event_value", type: "VARCHAR", description: "イベント値" },
          { name: "timestamp", type: "TIMESTAMP", description: "発生日時" },
        ],
      },
    ],
  },
}

const unifiedSchemas = [
  {
    name: "unified_customers",
    description: "名寄せ済み統合顧客マスタ",
    columns: [
      { name: "unified_id", type: "SERIAL", pk: true, description: "統合顧客ID" },
      { name: "name_kanji", type: "VARCHAR", description: "漢字氏名" },
      { name: "name_kana", type: "VARCHAR", description: "カナ氏名" },
      { name: "email", type: "VARCHAR", description: "メールアドレス" },
      { name: "phone", type: "VARCHAR", description: "電話番号（E.164形式）" },
      { name: "birth_date", type: "DATE", description: "生年月日（西暦統一）" },
      { name: "prefecture", type: "VARCHAR", description: "都道府県（正規化済）" },
      { name: "resolution_score", type: "FLOAT", description: "名寄せ信頼度（0-1）" },
      { name: "created_at", type: "TIMESTAMP", description: "作成日時" },
      { name: "updated_at", type: "TIMESTAMP", description: "更新日時" },
    ],
  },
  {
    name: "customer_id_map",
    description: "各システムIDと統合IDの対応",
    columns: [
      { name: "unified_id", type: "INT", fk: "unified_customers", description: "統合顧客ID" },
      { name: "source_system", type: "VARCHAR", description: "ソースシステム" },
      { name: "source_id", type: "VARCHAR", description: "ソースシステムID" },
      { name: "matched_at", type: "TIMESTAMP", description: "マッチング日時" },
      { name: "match_method", type: "VARCHAR", description: "マッチング方法" },
    ],
  },
  {
    name: "unified_products",
    description: "統合商品マスタ",
    columns: [
      { name: "unified_product_id", type: "SERIAL", pk: true, description: "統合商品ID" },
      { name: "category_id", type: "INT", fk: "master_categories", description: "カテゴリID" },
      { name: "name", type: "VARCHAR", description: "商品名" },
      { name: "brand", type: "VARCHAR", description: "ブランド" },
      { name: "price", type: "INT", description: "価格" },
      { name: "embedding", type: "VECTOR(768)", description: "商品Embedding" },
    ],
  },
]

const scoringSchemas = [
  {
    name: "customer_scores",
    description: "顧客スコア（バッチ更新）",
    columns: [
      { name: "unified_id", type: "INT", fk: "unified_customers", description: "統合顧客ID" },
      { name: "category_id", type: "INT", fk: "master_categories", description: "カテゴリID" },
      { name: "affinity_score", type: "FLOAT", description: "カテゴリ親和性（0-100）" },
      { name: "churn_risk_score", type: "FLOAT", description: "チャーンリスク（0-1）" },
      { name: "visit_predict_score", type: "FLOAT", description: "来店予測（0-1）" },
      { name: "timing_score", type: "FLOAT", description: "購買タイミングスコア" },
      { name: "updated_at", type: "TIMESTAMP", description: "更新日時" },
      { name: "batch_run_date", type: "DATE", description: "バッチ実行日" },
    ],
  },
  {
    name: "customer_signals",
    description: "顧客シグナル（イベント単位）",
    columns: [
      { name: "signal_id", type: "BIGSERIAL", pk: true, description: "シグナルID" },
      { name: "unified_id", type: "INT", fk: "unified_customers", description: "統合顧客ID" },
      { name: "category_id", type: "INT", description: "カテゴリID" },
      { name: "signal_type", type: "VARCHAR", description: "シグナル種別" },
      { name: "signal_value", type: "FLOAT", description: "スコア加算値" },
      { name: "source_event_id", type: "VARCHAR", description: "元イベントID" },
      { name: "occurred_at", type: "TIMESTAMP", description: "発生日時" },
    ],
  },
  {
    name: "churn_labels",
    description: "チャーン分類ラベル",
    columns: [
      { name: "unified_id", type: "INT", pk: true, description: "統合顧客ID" },
      { name: "label", type: "VARCHAR", description: "ラベル（active/dormant/churned）" },
      { name: "last_purchase_at", type: "TIMESTAMP", description: "最終購買日時" },
      { name: "days_since_purchase", type: "INT", description: "購買からの経過日数" },
      { name: "updated_at", type: "TIMESTAMP", description: "更新日時" },
    ],
  },
]

function SchemaTable({ columns }: { columns: typeof unifiedSchemas[0]["columns"] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[200px]">カラム名</TableHead>
          <TableHead className="w-[120px]">型</TableHead>
          <TableHead>説明</TableHead>
          <TableHead className="w-[80px]">キー</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {columns.map((col) => (
          <TableRow key={col.name}>
            <TableCell className="font-mono text-sm">{col.name}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{col.type}</TableCell>
            <TableCell className="text-sm">{col.description}</TableCell>
            <TableCell>
              <div className="flex gap-1">
                {col.pk && (
                  <Badge variant="outline" className="text-xs border-primary/50 text-primary">
                    <Key className="mr-1 h-3 w-3" />
                    PK
                  </Badge>
                )}
                {col.fk && (
                  <Badge variant="outline" className="text-xs">
                    <Link2 className="mr-1 h-3 w-3" />
                    FK
                  </Badge>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function SchemaPanel() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">スキーマ定義</h1>
        <p className="text-sm text-muted-foreground">
          データ基盤のテーブル構造とカラム定義
        </p>
      </div>

      <Tabs defaultValue="source" className="space-y-4">
        <TabsList>
          <TabsTrigger value="source">ソース層</TabsTrigger>
          <TabsTrigger value="unified">統合層</TabsTrigger>
          <TabsTrigger value="scoring">スコアリング層</TabsTrigger>
        </TabsList>

        {/* Source Layer */}
        <TabsContent value="source" className="space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">ソース層スキーマ</CardTitle>
              <CardDescription>
                各システムの生データをそのまま再現（汚れも含む）
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                {Object.entries(sourceSchemas).map(([key, system]) => (
                  <AccordionItem key={key} value={key}>
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-3">
                        <Database className="h-4 w-4 text-primary" />
                        <div className="text-left">
                          <p className="font-medium">{system.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {system.description}
                          </p>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-4 pt-2">
                        {system.tables.map((table) => (
                          <div
                            key={table.name}
                            className="rounded-lg border border-border p-4"
                          >
                            <div className="mb-3">
                              <p className="font-mono text-sm font-medium text-foreground">
                                {table.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {table.description}
                              </p>
                            </div>
                            <SchemaTable columns={table.columns} />
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">データ品質の問題点</CardTitle>
              <CardDescription>
                ソース層に存在する既知の問題（Synthetic Dataで再現）
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <p className="text-sm font-medium text-foreground">名寄せされていない</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    同一人物が3システムに別々に存在（EC: user_id, POS: member_id, App: uid）
                  </p>
                </div>
                <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
                  <p className="text-sm font-medium text-foreground">フォーマット不統一</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    電話番号: 090-xxxx-xxxx / 09012345678 / +81-90-xxx 混在
                  </p>
                </div>
                <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
                  <p className="text-sm font-medium text-foreground">和暦・西暦混在</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    POS: 和暦文字列（S55）、EC: 西暦（1980）
                  </p>
                </div>
                <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
                  <p className="text-sm font-medium text-foreground">商品コード体系の違い</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    基幹: P-1042 / EC: EC1042 / POS: POS-A1042
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Unified Layer */}
        <TabsContent value="unified" className="space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">統合層スキーマ</CardTitle>
              <CardDescription>
                名寄せ・クレンジング後のマスタ（PostgreSQL）
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {unifiedSchemas.map((table) => (
                  <div
                    key={table.name}
                    className="rounded-lg border border-border p-4"
                  >
                    <div className="mb-3">
                      <p className="font-mono text-sm font-medium text-foreground">
                        {table.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {table.description}
                      </p>
                    </div>
                    <SchemaTable columns={table.columns} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">名寄せ方法</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-border p-3">
                  <Badge variant="outline" className="mb-2">email</Badge>
                  <p className="text-sm text-muted-foreground">
                    メールアドレス完全一致でマッチング
                  </p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <Badge variant="outline" className="mb-2">phone</Badge>
                  <p className="text-sm text-muted-foreground">
                    正規化後の電話番号でマッチング
                  </p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <Badge variant="outline" className="mb-2">name+birth</Badge>
                  <p className="text-sm text-muted-foreground">
                    氏名カナ＋生年月日の組み合わせ
                  </p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <Badge variant="outline" className="mb-2">manual</Badge>
                  <p className="text-sm text-muted-foreground">
                    手動確認によるマッチング
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Scoring Layer */}
        <TabsContent value="scoring" className="space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">スコアリング層スキーマ</CardTitle>
              <CardDescription>
                潜在スコア・チャーン分類など（PostgreSQL + Redis）
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {scoringSchemas.map((table) => (
                  <div
                    key={table.name}
                    className="rounded-lg border border-border p-4"
                  >
                    <div className="mb-3">
                      <p className="font-mono text-sm font-medium text-foreground">
                        {table.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {table.description}
                      </p>
                    </div>
                    <SchemaTable columns={table.columns} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">スコアリング更新頻度</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      カテゴリ親和性スコア
                    </p>
                    <p className="text-xs text-muted-foreground">
                      「これも気になりませんか」サジェスト
                    </p>
                  </div>
                  <Badge>日次バッチ</Badge>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      チャーンリスクスコア
                    </p>
                    <p className="text-xs text-muted-foreground">
                      「久しぶりにいかがですか」キャンペーン
                    </p>
                  </div>
                  <Badge>週次バッチ</Badge>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      購買タイミングスコア
                    </p>
                    <p className="text-xs text-muted-foreground">
                      「買い替え時期では？」サジェスト
                    </p>
                  </div>
                  <Badge>週次バッチ</Badge>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">来店予測スコア</p>
                    <p className="text-xs text-muted-foreground">
                      店舗スタッフ配置・在庫最適化
                    </p>
                  </div>
                  <Badge>週次バッチ</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
