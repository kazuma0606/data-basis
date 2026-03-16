"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  CheckCircle,
  Clock,
  Activity,
  Users,
  TrendingUp,
  AlertTriangle,
  Play,
  Pause,
} from "lucide-react"
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  PieChart,
  Pie,
} from "recharts"

const batchJobs = [
  {
    name: "カテゴリ親和性スコア",
    schedule: "毎日 03:00",
    lastRun: "2024-01-15 03:00:12",
    duration: "12分34秒",
    records: 42156,
    status: "completed",
    nextRun: "2024-01-16 03:00:00",
  },
  {
    name: "チャーンリスクスコア",
    schedule: "毎週月曜 04:00",
    lastRun: "2024-01-15 04:00:05",
    duration: "8分21秒",
    records: 42156,
    status: "completed",
    nextRun: "2024-01-22 04:00:00",
  },
  {
    name: "購買タイミングスコア",
    schedule: "毎週月曜 05:00",
    lastRun: "2024-01-15 05:00:08",
    duration: "15分42秒",
    records: 42156,
    status: "completed",
    nextRun: "2024-01-22 05:00:00",
  },
  {
    name: "来店予測スコア",
    schedule: "毎週月曜 06:00",
    lastRun: "2024-01-15 06:00:03",
    duration: "22分18秒",
    records: 42156,
    status: "completed",
    nextRun: "2024-01-22 06:00:00",
  },
  {
    name: "名寄せバッチ",
    schedule: "毎日 02:00",
    lastRun: "2024-01-15 02:00:00",
    duration: "45分12秒",
    records: 98420,
    status: "completed",
    nextRun: "2024-01-16 02:00:00",
  },
  {
    name: "ClickHouseロード",
    schedule: "毎日 07:00",
    lastRun: "2024-01-15 07:00:00",
    duration: "18分45秒",
    records: 1240000,
    status: "completed",
    nextRun: "2024-01-16 07:00:00",
  },
]

const churnDistribution = [
  { name: "active", label: "アクティブ", value: 16862, color: "hsl(145, 60%, 50%)" },
  { name: "dormant", label: "休眠", value: 16862, color: "hsl(85, 60%, 55%)" },
  { name: "churned", label: "チャーン", value: 8432, color: "hsl(25, 70%, 55%)" },
]

const scoreDistribution = [
  { range: "0-20", count: 4215, category: "低" },
  { range: "21-40", count: 8431, category: "やや低" },
  { range: "41-60", count: 12647, category: "中" },
  { range: "61-80", count: 10539, category: "やや高" },
  { range: "81-100", count: 6324, category: "高" },
]

const recentSignals = [
  {
    customerId: "UC-12345",
    category: "調理家電",
    signalType: "cart_add",
    value: "+30",
    timestamp: "14:32:15",
  },
  {
    customerId: "UC-12346",
    category: "映像・音響",
    signalType: "product_compare",
    value: "+25",
    timestamp: "14:31:48",
  },
  {
    customerId: "UC-12347",
    category: "生活家電",
    signalType: "review_read",
    value: "+15",
    timestamp: "14:31:22",
  },
  {
    customerId: "UC-12348",
    category: "PC・スマホ",
    signalType: "spec_expand",
    value: "+15",
    timestamp: "14:30:55",
  },
  {
    customerId: "UC-12349",
    category: "生活用品",
    signalType: "wishlist_add",
    value: "+30",
    timestamp: "14:30:12",
  },
]

export function ScoringPanel() {
  const totalCustomers = churnDistribution.reduce((acc, d) => acc + d.value, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">スコアリング</h1>
        <p className="text-sm text-muted-foreground">
          バッチ処理の実行状況とスコア分布
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <Users className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="mt-3">
              <p className="text-2xl font-bold text-foreground">
                {totalCustomers.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">スコアリング対象顧客</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <Activity className="h-5 w-5 text-muted-foreground" />
              <Badge variant="outline" className="text-success border-success/50">
                Healthy
              </Badge>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-bold text-foreground">6/6</p>
              <p className="text-xs text-muted-foreground">正常完了バッチ</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <TrendingUp className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="mt-3">
              <p className="text-2xl font-bold text-foreground">58.2</p>
              <p className="text-xs text-muted-foreground">平均親和性スコア</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <Clock className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="mt-3">
              <p className="text-2xl font-bold text-foreground">2:12:52</p>
              <p className="text-xs text-muted-foreground">本日の総処理時間</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Churn Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">チャーン分布</CardTitle>
            <CardDescription>顧客の状態分類</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-8">
              <div className="h-[180px] w-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={churnDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      dataKey="value"
                    >
                      {churnDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(0, 0%, 14%)",
                        border: "1px solid hsl(0, 0%, 25%)",
                        borderRadius: "8px",
                      }}
                      labelStyle={{ color: "hsl(0, 0%, 95%)" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-3">
                {churnDistribution.map((item) => (
                  <div key={item.name} className="flex items-center gap-3">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {item.label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.value.toLocaleString()}人 (
                        {((item.value / totalCustomers) * 100).toFixed(1)}%)
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Score Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">親和性スコア分布</CardTitle>
            <CardDescription>カテゴリ親和性スコアのヒストグラム</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={scoreDistribution}>
                  <XAxis
                    dataKey="range"
                    tick={{ fill: "hsl(0, 0%, 65%)", fontSize: 10 }}
                    axisLine={{ stroke: "hsl(0, 0%, 25%)" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "hsl(0, 0%, 65%)", fontSize: 10 }}
                    axisLine={{ stroke: "hsl(0, 0%, 25%)" }}
                    tickLine={false}
                    tickFormatter={(value) => `${(value / 1000).toFixed(0)}K`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(0, 0%, 14%)",
                      border: "1px solid hsl(0, 0%, 25%)",
                      borderRadius: "8px",
                    }}
                    labelStyle={{ color: "hsl(0, 0%, 95%)" }}
                  />
                  <Bar
                    dataKey="count"
                    fill="hsl(180, 60%, 50%)"
                    radius={[4, 4, 0, 0]}
                    name="顧客数"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Batch Jobs */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">バッチジョブ一覧</CardTitle>
          <CardDescription>スケジュール実行されるバッチ処理</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ジョブ名</TableHead>
                <TableHead>スケジュール</TableHead>
                <TableHead>最終実行</TableHead>
                <TableHead className="text-right">処理件数</TableHead>
                <TableHead className="text-right">処理時間</TableHead>
                <TableHead className="text-right">状態</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batchJobs.map((job) => (
                <TableRow key={job.name}>
                  <TableCell className="font-medium">{job.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {job.schedule}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {job.lastRun}
                  </TableCell>
                  <TableCell className="text-right">
                    {job.records.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">{job.duration}</TableCell>
                  <TableCell className="text-right">
                    <Badge
                      variant="outline"
                      className="border-success/50 bg-success/10 text-success"
                    >
                      <CheckCircle className="mr-1 h-3 w-3" />
                      完了
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Recent Signals */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">最近のシグナル</CardTitle>
          <CardDescription>リアルタイムで記録されたスコア加算イベント</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {recentSignals.map((signal, index) => (
              <div
                key={index}
                className="flex items-center justify-between rounded-lg border border-border p-3"
              >
                <div className="flex items-center gap-4">
                  <div className="rounded-md bg-secondary p-2">
                    <Activity className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-foreground">
                        {signal.customerId}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {signal.category}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {signal.signalType}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-mono text-sm font-medium text-success">
                    {signal.value}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {signal.timestamp}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Scoring Reference */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">シグナル強度リファレンス</CardTitle>
          <CardDescription>イベント種別ごとのスコア加算値</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-border p-4">
              <h4 className="text-sm font-medium text-foreground">強シグナル</h4>
              <div className="mt-2 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">cart_add</span>
                  <span className="font-mono text-success">+30</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">wishlist_add</span>
                  <span className="font-mono text-success">+30</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">product_compare</span>
                  <span className="font-mono text-success">+25</span>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-border p-4">
              <h4 className="text-sm font-medium text-foreground">中シグナル</h4>
              <div className="mt-2 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">review_read</span>
                  <span className="font-mono text-primary">+15</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">spec_expand</span>
                  <span className="font-mono text-primary">+15</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">search</span>
                  <span className="font-mono text-primary">+10</span>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-border p-4">
              <h4 className="text-sm font-medium text-foreground">弱シグナル</h4>
              <div className="mt-2 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">scroll_depth</span>
                  <span className="font-mono text-muted-foreground">+5</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">page_view</span>
                  <span className="font-mono text-muted-foreground">+2</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">dwell_time</span>
                  <span className="font-mono text-muted-foreground">+3</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
