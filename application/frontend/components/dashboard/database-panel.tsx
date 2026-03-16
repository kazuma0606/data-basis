"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Database,
  HardDrive,
  Activity,
  Clock,
  CheckCircle,
  Zap,
} from "lucide-react"
import {
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts"

const postgresMetrics = {
  connections: { current: 12, max: 100 },
  activeQueries: 3,
  transactionsPerSec: 245,
  cacheHitRatio: 98.5,
  diskUsage: { used: 2.4, total: 10 },
  replicationLag: "0ms",
}

const clickhouseMetrics = {
  queries: 156,
  rowsRead: "124M",
  bytesRead: "8.2 GB",
  avgQueryTime: "235ms",
  diskUsage: { used: 45, total: 100 },
  compressionRatio: "4.2x",
}

const redisMetrics = {
  keys: 45280,
  memory: { used: 256, max: 1024 },
  hitRate: 94.2,
  connectedClients: 8,
  evictedKeys: 0,
  expiredKeys: 1240,
}

const postgresQueryData = Array.from({ length: 30 }, (_, i) => ({
  time: `${30 - i}分`,
  queries: Math.floor(Math.random() * 100 + 200),
  latency: Math.floor(Math.random() * 20 + 10),
}))

const postgresTables = [
  { name: "unified_customers", rows: 42156, size: "128 MB", lastVacuum: "2時間前" },
  { name: "customer_id_map", rows: 98420, size: "64 MB", lastVacuum: "2時間前" },
  { name: "unified_products", rows: 8540, size: "256 MB", lastVacuum: "3時間前" },
  { name: "product_id_map", rows: 25620, size: "32 MB", lastVacuum: "3時間前" },
  { name: "customer_scores", rows: 168624, size: "96 MB", lastVacuum: "1時間前" },
  { name: "customer_signals", rows: 2458320, size: "512 MB", lastVacuum: "30分前" },
  { name: "churn_labels", rows: 42156, size: "16 MB", lastVacuum: "1時間前" },
]

const clickhouseTables = [
  { name: "sales_by_channel", rows: "12.4M", size: "2.8 GB", compression: "4.1x" },
  { name: "customer_behavior_daily", rows: "45.2M", size: "8.5 GB", compression: "3.8x" },
  { name: "category_affinity_summary", rows: "2.1M", size: "420 MB", compression: "5.2x" },
  { name: "churn_summary_weekly", rows: "156K", size: "32 MB", compression: "4.8x" },
]

export function DatabasePanel() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">データベース</h1>
        <p className="text-sm text-muted-foreground">
          PostgreSQL、ClickHouse、Redisの状態とメトリクス
        </p>
      </div>

      <Tabs defaultValue="postgres" className="space-y-4">
        <TabsList>
          <TabsTrigger value="postgres">PostgreSQL</TabsTrigger>
          <TabsTrigger value="clickhouse">ClickHouse</TabsTrigger>
          <TabsTrigger value="redis">Redis</TabsTrigger>
        </TabsList>

        {/* PostgreSQL Tab */}
        <TabsContent value="postgres" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <Database className="h-5 w-5 text-muted-foreground" />
                  <Badge variant="outline" className="text-success border-success/50">
                    <CheckCircle className="mr-1 h-3 w-3" />
                    Connected
                  </Badge>
                </div>
                <div className="mt-3">
                  <p className="text-2xl font-bold text-foreground">
                    {postgresMetrics.connections.current}/{postgresMetrics.connections.max}
                  </p>
                  <p className="text-xs text-muted-foreground">アクティブ接続</p>
                </div>
                <Progress
                  value={(postgresMetrics.connections.current / postgresMetrics.connections.max) * 100}
                  className="mt-2 h-1"
                />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <Activity className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="mt-3">
                  <p className="text-2xl font-bold text-foreground">
                    {postgresMetrics.transactionsPerSec}
                  </p>
                  <p className="text-xs text-muted-foreground">トランザクション/秒</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <Zap className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="mt-3">
                  <p className="text-2xl font-bold text-foreground">
                    {postgresMetrics.cacheHitRatio}%
                  </p>
                  <p className="text-xs text-muted-foreground">キャッシュヒット率</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <HardDrive className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="mt-3">
                  <p className="text-2xl font-bold text-foreground">
                    {postgresMetrics.diskUsage.used} GB
                  </p>
                  <p className="text-xs text-muted-foreground">
                    / {postgresMetrics.diskUsage.total} GB 使用中
                  </p>
                </div>
                <Progress
                  value={(postgresMetrics.diskUsage.used / postgresMetrics.diskUsage.total) * 100}
                  className="mt-2 h-1"
                />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">クエリパフォーマンス</CardTitle>
              <CardDescription>過去30分間のクエリ実行状況</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={postgresQueryData}>
                    <XAxis
                      dataKey="time"
                      tick={{ fill: "hsl(0, 0%, 65%)", fontSize: 10 }}
                      axisLine={{ stroke: "hsl(0, 0%, 25%)" }}
                      tickLine={false}
                      interval={4}
                    />
                    <YAxis
                      yAxisId="left"
                      tick={{ fill: "hsl(0, 0%, 65%)", fontSize: 10 }}
                      axisLine={{ stroke: "hsl(0, 0%, 25%)" }}
                      tickLine={false}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{ fill: "hsl(0, 0%, 65%)", fontSize: 10 }}
                      axisLine={{ stroke: "hsl(0, 0%, 25%)" }}
                      tickLine={false}
                      tickFormatter={(value) => `${value}ms`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(0, 0%, 14%)",
                        border: "1px solid hsl(0, 0%, 25%)",
                        borderRadius: "8px",
                      }}
                      labelStyle={{ color: "hsl(0, 0%, 95%)" }}
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="queries"
                      stroke="hsl(180, 60%, 50%)"
                      strokeWidth={2}
                      dot={false}
                      name="クエリ数"
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="latency"
                      stroke="hsl(85, 60%, 55%)"
                      strokeWidth={2}
                      dot={false}
                      name="平均レイテンシ"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">テーブル一覧（統合層）</CardTitle>
              <CardDescription>統合層のPostgreSQLテーブル</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>テーブル名</TableHead>
                    <TableHead className="text-right">行数</TableHead>
                    <TableHead className="text-right">サイズ</TableHead>
                    <TableHead className="text-right">最終VACUUM</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {postgresTables.map((table) => (
                    <TableRow key={table.name}>
                      <TableCell className="font-mono text-sm">{table.name}</TableCell>
                      <TableCell className="text-right">
                        {table.rows.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">{table.size}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {table.lastVacuum}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ClickHouse Tab */}
        <TabsContent value="clickhouse" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <Database className="h-5 w-5 text-muted-foreground" />
                  <Badge variant="outline" className="text-success border-success/50">
                    <CheckCircle className="mr-1 h-3 w-3" />
                    Running
                  </Badge>
                </div>
                <div className="mt-3">
                  <p className="text-2xl font-bold text-foreground">
                    {clickhouseMetrics.queries}
                  </p>
                  <p className="text-xs text-muted-foreground">今日のクエリ数</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <Activity className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="mt-3">
                  <p className="text-2xl font-bold text-foreground">
                    {clickhouseMetrics.rowsRead}
                  </p>
                  <p className="text-xs text-muted-foreground">読み取り行数</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="mt-3">
                  <p className="text-2xl font-bold text-foreground">
                    {clickhouseMetrics.avgQueryTime}
                  </p>
                  <p className="text-xs text-muted-foreground">平均クエリ時間</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <HardDrive className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="mt-3">
                  <p className="text-2xl font-bold text-foreground">
                    {clickhouseMetrics.compressionRatio}
                  </p>
                  <p className="text-xs text-muted-foreground">圧縮率</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">分析テーブル一覧</CardTitle>
              <CardDescription>ClickHouseの集計・分析テーブル</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>テーブル名</TableHead>
                    <TableHead className="text-right">行数</TableHead>
                    <TableHead className="text-right">サイズ</TableHead>
                    <TableHead className="text-right">圧縮率</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clickhouseTables.map((table) => (
                    <TableRow key={table.name}>
                      <TableCell className="font-mono text-sm">{table.name}</TableCell>
                      <TableCell className="text-right">{table.rows}</TableCell>
                      <TableCell className="text-right">{table.size}</TableCell>
                      <TableCell className="text-right text-primary">
                        {table.compression}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">用途別テーブル説明</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="rounded-lg border border-border p-3">
                  <p className="font-mono text-sm font-medium text-foreground">
                    sales_by_channel
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    チャネル別・カテゴリ別売上のダッシュボード用データ
                  </p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="font-mono text-sm font-medium text-foreground">
                    customer_behavior_daily
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    顧客行動サマリ、コホート分析用
                  </p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="font-mono text-sm font-medium text-foreground">
                    category_affinity_summary
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    どの属性がどのカテゴリに親和性が高いかの把握
                  </p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="font-mono text-sm font-medium text-foreground">
                    churn_summary_weekly
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    チャーン状況のトレンド把握
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Redis Tab */}
        <TabsContent value="redis" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <Database className="h-5 w-5 text-muted-foreground" />
                  <Badge variant="outline" className="text-success border-success/50">
                    <CheckCircle className="mr-1 h-3 w-3" />
                    Connected
                  </Badge>
                </div>
                <div className="mt-3">
                  <p className="text-2xl font-bold text-foreground">
                    {redisMetrics.keys.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">キー総数</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <HardDrive className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="mt-3">
                  <p className="text-2xl font-bold text-foreground">
                    {redisMetrics.memory.used} MB
                  </p>
                  <p className="text-xs text-muted-foreground">
                    / {redisMetrics.memory.max} MB 使用中
                  </p>
                </div>
                <Progress
                  value={(redisMetrics.memory.used / redisMetrics.memory.max) * 100}
                  className="mt-2 h-1"
                />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <Zap className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="mt-3">
                  <p className="text-2xl font-bold text-foreground">
                    {redisMetrics.hitRate}%
                  </p>
                  <p className="text-xs text-muted-foreground">キャッシュヒット率</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <Activity className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="mt-3">
                  <p className="text-2xl font-bold text-foreground">
                    {redisMetrics.connectedClients}
                  </p>
                  <p className="text-xs text-muted-foreground">接続クライアント数</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">キャッシュキーパターン</CardTitle>
              <CardDescription>Redisに格納されているスコアキャッシュ</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-mono text-sm text-foreground">
                      {"customer:score:{unified_id}:category:{category_id}"}
                    </p>
                    <Badge variant="outline">TTL: 24h</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    カテゴリ親和性スコアのキャッシュ
                  </p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-mono text-sm text-foreground">
                      {"customer:churn:{unified_id}"}
                    </p>
                    <Badge variant="outline">TTL: 24h</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    チャーン分類ラベルのキャッシュ
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
