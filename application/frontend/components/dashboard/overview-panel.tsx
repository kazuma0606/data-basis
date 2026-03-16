"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Database,
  Radio,
  HardDrive,
  Users,
  Activity,
  CheckCircle,
  AlertTriangle,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react"
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts"

const systemStatus = [
  {
    name: "PostgreSQL",
    status: "healthy",
    uptime: "99.9%",
    icon: Database,
    metrics: { connections: 12, maxConnections: 100 },
  },
  {
    name: "ClickHouse",
    status: "healthy",
    uptime: "99.8%",
    icon: Database,
    metrics: { queries: 245, avgLatency: "12ms" },
  },
  {
    name: "Kafka",
    status: "healthy",
    uptime: "99.9%",
    icon: Radio,
    metrics: { topics: 5, messages: "1.2M" },
  },
  {
    name: "Redis",
    status: "healthy",
    uptime: "100%",
    icon: HardDrive,
    metrics: { keys: "45K", memory: "256MB" },
  },
  {
    name: "S3 (LocalStack)",
    status: "healthy",
    uptime: "100%",
    icon: HardDrive,
    metrics: { buckets: 3, objects: "12K" },
  },
]

const recentEvents = [
  {
    time: "14:32:15",
    type: "info",
    message: "スコアリングバッチ完了 - 処理件数: 4,521件",
  },
  {
    time: "14:30:00",
    type: "info",
    message: "名寄せバッチ開始 - 対象: ec.customers",
  },
  {
    time: "14:25:43",
    type: "warning",
    message: "Kafka consumer lag 検出 - topic: ec.events",
  },
  {
    time: "14:20:00",
    type: "info",
    message: "S3同期完了 - raw/ec/2024/01/15/",
  },
  {
    time: "14:15:22",
    type: "info",
    message: "ClickHouseへのデータロード完了",
  },
]

const throughputData = Array.from({ length: 24 }, (_, i) => ({
  time: `${String(i).padStart(2, "0")}:00`,
  events: Math.floor(Math.random() * 5000 + 3000),
  processed: Math.floor(Math.random() * 4800 + 2900),
}))

const summaryStats = [
  {
    label: "統合顧客数",
    value: "42,156",
    change: "+1.2%",
    trend: "up",
    icon: Users,
  },
  {
    label: "今日の処理イベント",
    value: "1.24M",
    change: "+8.5%",
    trend: "up",
    icon: Activity,
  },
  {
    label: "名寄せ成功率",
    value: "94.2%",
    change: "+0.3%",
    trend: "up",
    icon: CheckCircle,
  },
  {
    label: "平均レイテンシ",
    value: "23ms",
    change: "-5.2%",
    trend: "down",
    icon: Clock,
  },
]

export function OverviewPanel() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">概要</h1>
        <p className="text-sm text-muted-foreground">
          データ基盤の全体的な状態を確認できます
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {summaryStats.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.label}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                  <div
                    className={`flex items-center text-xs ${
                      stat.trend === "up" ? "text-success" : "text-primary"
                    }`}
                  >
                    {stat.trend === "up" ? (
                      <ArrowUpRight className="h-3 w-3" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3" />
                    )}
                    {stat.change}
                  </div>
                </div>
                <div className="mt-3">
                  <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Throughput Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">イベントスループット</CardTitle>
          <CardDescription>過去24時間のイベント処理状況</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={throughputData}>
                <defs>
                  <linearGradient id="colorEvents" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(180, 60%, 50%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(180, 60%, 50%)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorProcessed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(85, 60%, 55%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(85, 60%, 55%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="time"
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
                <Area
                  type="monotone"
                  dataKey="events"
                  stroke="hsl(180, 60%, 50%)"
                  fill="url(#colorEvents)"
                  strokeWidth={2}
                  name="受信イベント"
                />
                <Area
                  type="monotone"
                  dataKey="processed"
                  stroke="hsl(85, 60%, 55%)"
                  fill="url(#colorProcessed)"
                  strokeWidth={2}
                  name="処理済み"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* System Status */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">システム状態</CardTitle>
            <CardDescription>各コンポーネントのヘルスチェック</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {systemStatus.map((system) => {
                const Icon = system.icon
                return (
                  <div
                    key={system.name}
                    className="flex items-center justify-between rounded-lg border border-border p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="rounded-md bg-secondary p-2">
                        <Icon className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {system.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Uptime: {system.uptime}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className="border-success/50 bg-success/10 text-success"
                    >
                      <CheckCircle className="mr-1 h-3 w-3" />
                      Healthy
                    </Badge>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Recent Events */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">最近のイベント</CardTitle>
            <CardDescription>システムログ（直近5件）</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentEvents.map((event, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 rounded-lg border border-border p-3"
                >
                  {event.type === "warning" ? (
                    <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" />
                  ) : (
                    <CheckCircle className="mt-0.5 h-4 w-4 text-success" />
                  )}
                  <div className="flex-1">
                    <p className="text-sm text-foreground">{event.message}</p>
                    <p className="text-xs text-muted-foreground">{event.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
