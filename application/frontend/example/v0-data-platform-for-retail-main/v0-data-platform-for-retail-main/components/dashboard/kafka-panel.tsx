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
  ArrowDownRight,
  ArrowUpRight,
  Radio,
  Activity,
  Clock,
  Layers,
} from "lucide-react"
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  Bar,
  BarChart,
} from "recharts"

const topics = [
  {
    name: "ec.events",
    partitions: 3,
    replicationFactor: 1,
    messagesPerSec: 1250,
    bytesPerSec: "2.4 MB",
    consumerLag: 45,
    status: "healthy",
  },
  {
    name: "ec.orders",
    partitions: 3,
    replicationFactor: 1,
    messagesPerSec: 85,
    bytesPerSec: "256 KB",
    consumerLag: 0,
    status: "healthy",
  },
  {
    name: "pos.transactions",
    partitions: 3,
    replicationFactor: 1,
    messagesPerSec: 320,
    bytesPerSec: "890 KB",
    consumerLag: 12,
    status: "healthy",
  },
  {
    name: "pos.visits",
    partitions: 2,
    replicationFactor: 1,
    messagesPerSec: 180,
    bytesPerSec: "420 KB",
    consumerLag: 0,
    status: "healthy",
  },
  {
    name: "app.behaviors",
    partitions: 3,
    replicationFactor: 1,
    messagesPerSec: 890,
    bytesPerSec: "1.8 MB",
    consumerLag: 8,
    status: "healthy",
  },
  {
    name: "inventory.updates",
    partitions: 2,
    replicationFactor: 1,
    messagesPerSec: 25,
    bytesPerSec: "64 KB",
    consumerLag: 0,
    status: "healthy",
  },
  {
    name: "customer.scores",
    partitions: 3,
    replicationFactor: 1,
    messagesPerSec: 150,
    bytesPerSec: "380 KB",
    consumerLag: 0,
    status: "healthy",
  },
]

const consumerGroups = [
  {
    name: "scoring-service",
    topics: ["ec.events", "pos.transactions", "app.behaviors"],
    lag: 65,
    members: 3,
    status: "active",
  },
  {
    name: "s3-sink-connector",
    topics: ["ec.events", "ec.orders", "pos.transactions", "pos.visits", "app.behaviors"],
    lag: 12,
    members: 5,
    status: "active",
  },
  {
    name: "postgres-sync",
    topics: ["ec.orders", "pos.transactions", "inventory.updates"],
    lag: 0,
    members: 3,
    status: "active",
  },
  {
    name: "redis-cache-updater",
    topics: ["customer.scores"],
    lag: 0,
    members: 2,
    status: "active",
  },
]

const throughputData = Array.from({ length: 60 }, (_, i) => ({
  time: `${60 - i}分前`,
  messages: Math.floor(Math.random() * 3000 + 2000),
  bytes: Math.floor(Math.random() * 6 + 4),
}))

const topicDistribution = topics.map((t) => ({
  name: t.name.split(".")[1],
  messages: t.messagesPerSec,
}))

export function KafkaPanel() {
  const totalMessages = topics.reduce((acc, t) => acc + t.messagesPerSec, 0)
  const totalLag = topics.reduce((acc, t) => acc + t.consumerLag, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Kafka モニタリング</h1>
        <p className="text-sm text-muted-foreground">
          ストリーミング基盤の状態とメトリクス
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <Radio className="h-5 w-5 text-muted-foreground" />
              <Badge variant="outline" className="text-success border-success/50">
                Running
              </Badge>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-bold text-foreground">{topics.length}</p>
              <p className="text-xs text-muted-foreground">アクティブトピック</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <Activity className="h-5 w-5 text-muted-foreground" />
              <div className="flex items-center text-xs text-success">
                <ArrowUpRight className="h-3 w-3" />
                +12.5%
              </div>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-bold text-foreground">
                {totalMessages.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">メッセージ/秒</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <div className="flex items-center text-xs text-primary">
                <ArrowDownRight className="h-3 w-3" />
                -8.2%
              </div>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-bold text-foreground">{totalLag}</p>
              <p className="text-xs text-muted-foreground">総Consumer Lag</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <Layers className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="mt-3">
              <p className="text-2xl font-bold text-foreground">
                {consumerGroups.length}
              </p>
              <p className="text-xs text-muted-foreground">Consumer Groups</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">スループット推移</CardTitle>
            <CardDescription>過去60分間のメッセージ処理量</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={throughputData}>
                  <defs>
                    <linearGradient id="colorMessages" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(180, 60%, 50%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(180, 60%, 50%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="time"
                    tick={{ fill: "hsl(0, 0%, 65%)", fontSize: 10 }}
                    axisLine={{ stroke: "hsl(0, 0%, 25%)" }}
                    tickLine={false}
                    interval={9}
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
                    dataKey="messages"
                    stroke="hsl(180, 60%, 50%)"
                    fill="url(#colorMessages)"
                    strokeWidth={2}
                    name="メッセージ数"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">トピック別メッセージ量</CardTitle>
            <CardDescription>各トピックの秒間メッセージ数</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topicDistribution} layout="vertical">
                  <XAxis
                    type="number"
                    tick={{ fill: "hsl(0, 0%, 65%)", fontSize: 10 }}
                    axisLine={{ stroke: "hsl(0, 0%, 25%)" }}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fill: "hsl(0, 0%, 65%)", fontSize: 10 }}
                    axisLine={{ stroke: "hsl(0, 0%, 25%)" }}
                    tickLine={false}
                    width={80}
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
                    dataKey="messages"
                    fill="hsl(180, 60%, 50%)"
                    radius={[0, 4, 4, 0]}
                    name="メッセージ/秒"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Topics Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">トピック一覧</CardTitle>
          <CardDescription>全Kafkaトピックの詳細情報</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>トピック名</TableHead>
                <TableHead className="text-right">パーティション</TableHead>
                <TableHead className="text-right">メッセージ/秒</TableHead>
                <TableHead className="text-right">スループット</TableHead>
                <TableHead className="text-right">Consumer Lag</TableHead>
                <TableHead className="text-right">状態</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topics.map((topic) => (
                <TableRow key={topic.name}>
                  <TableCell className="font-mono text-sm">{topic.name}</TableCell>
                  <TableCell className="text-right">{topic.partitions}</TableCell>
                  <TableCell className="text-right">
                    {topic.messagesPerSec.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">{topic.bytesPerSec}</TableCell>
                  <TableCell className="text-right">
                    <span
                      className={
                        topic.consumerLag > 20
                          ? "text-warning"
                          : topic.consumerLag > 0
                          ? "text-muted-foreground"
                          : "text-success"
                      }
                    >
                      {topic.consumerLag}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge
                      variant="outline"
                      className="border-success/50 bg-success/10 text-success"
                    >
                      Healthy
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Consumer Groups */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Consumer Groups</CardTitle>
          <CardDescription>アクティブなコンシューマーグループ</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {consumerGroups.map((group) => (
              <div
                key={group.name}
                className="rounded-lg border border-border p-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-mono text-sm font-medium text-foreground">
                      {group.name}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      購読トピック: {group.topics.join(", ")}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="border-success/50 bg-success/10 text-success"
                  >
                    Active
                  </Badge>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">メンバー数</p>
                    <p className="text-sm font-medium text-foreground">
                      {group.members}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Consumer Lag</p>
                    <p className="text-sm font-medium text-foreground">{group.lag}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Lag進捗</p>
                    <Progress
                      value={100 - Math.min(group.lag, 100)}
                      className="mt-1 h-2"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
