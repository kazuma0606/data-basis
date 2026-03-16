"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  ArrowRight,
  Database,
  Radio,
  HardDrive,
  CheckCircle,
  Clock,
  Activity,
  AlertTriangle,
} from "lucide-react"

const pipelineStages = [
  {
    id: "sources",
    name: "データソース",
    description: "ECシステム / POSシステム / 会員アプリ",
    icon: Database,
    status: "active",
    metrics: { rate: "2,900 events/s" },
  },
  {
    id: "kafka",
    name: "Kafka",
    description: "ストリーム取り込み",
    icon: Radio,
    status: "active",
    metrics: { rate: "2,850 events/s", lag: "65" },
  },
  {
    id: "processing",
    name: "処理層",
    description: "Kafka Streams / ksqlDB",
    icon: Activity,
    status: "active",
    metrics: { rate: "2,800 events/s" },
  },
  {
    id: "storage",
    name: "ストレージ",
    description: "S3 / PostgreSQL / ClickHouse",
    icon: HardDrive,
    status: "active",
    metrics: { written: "1.2 GB/h" },
  },
]

const dataFlows = [
  {
    name: "EC閲覧イベント → スコアリング",
    source: "ec.events",
    destination: "scoring-service",
    status: "active",
    throughput: "1,250 msg/s",
    latency: "45ms",
  },
  {
    name: "EC注文 → PostgreSQL",
    source: "ec.orders",
    destination: "postgres-sync",
    status: "active",
    throughput: "85 msg/s",
    latency: "12ms",
  },
  {
    name: "POS取引 → S3アーカイブ",
    source: "pos.transactions",
    destination: "s3-sink-connector",
    status: "active",
    throughput: "320 msg/s",
    latency: "8ms",
  },
  {
    name: "アプリ行動 → スコアリング",
    source: "app.behaviors",
    destination: "scoring-service",
    status: "active",
    throughput: "890 msg/s",
    latency: "52ms",
  },
  {
    name: "スコア更新 → Redis",
    source: "customer.scores",
    destination: "redis-cache-updater",
    status: "active",
    throughput: "150 msg/s",
    latency: "3ms",
  },
]

const s3Buckets = [
  {
    path: "raw/ec/",
    description: "EC生ログ",
    objectCount: "4,521",
    size: "2.4 GB",
    lastSync: "1分前",
  },
  {
    path: "raw/pos/",
    description: "POS生データ",
    objectCount: "1,245",
    size: "890 MB",
    lastSync: "3分前",
  },
  {
    path: "raw/app/",
    description: "アプリ生ログ",
    objectCount: "3,892",
    size: "1.8 GB",
    lastSync: "2分前",
  },
  {
    path: "cleaned/customers/",
    description: "クレンジング済み顧客データ",
    objectCount: "42",
    size: "128 MB",
    lastSync: "1時間前",
  },
  {
    path: "aggregated/",
    description: "集計済みデータ",
    objectCount: "156",
    size: "3.2 GB",
    lastSync: "30分前",
  },
]

export function PipelinePanel() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">データパイプライン</h1>
        <p className="text-sm text-muted-foreground">
          データフローとパイプラインの状態を確認
        </p>
      </div>

      {/* Pipeline Visualization */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">パイプライン概要</CardTitle>
          <CardDescription>データの流れとステージ状態</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center justify-between gap-4">
            {pipelineStages.map((stage, index) => {
              const Icon = stage.icon
              return (
                <div key={stage.id} className="flex items-center gap-4">
                  <div className="flex flex-col items-center">
                    <div className="rounded-lg border border-border bg-card p-4">
                      <div className="flex items-center gap-3">
                        <div className="rounded-md bg-secondary p-2">
                          <Icon className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {stage.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {stage.description}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className="border-success/50 bg-success/10 text-success"
                        >
                          <CheckCircle className="mr-1 h-3 w-3" />
                          Active
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {stage.metrics.rate || stage.metrics.written}
                        </span>
                      </div>
                    </div>
                  </div>
                  {index < pipelineStages.length - 1 && (
                    <ArrowRight className="h-5 w-5 text-muted-foreground hidden md:block" />
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Data Flows */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">データフロー詳細</CardTitle>
          <CardDescription>トピックからサービスへのデータ転送状況</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {dataFlows.map((flow) => (
              <div
                key={flow.name}
                className="rounded-lg border border-border p-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {flow.name}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-mono">{flow.source}</span>
                      <ArrowRight className="h-3 w-3" />
                      <span className="font-mono">{flow.destination}</span>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className="border-success/50 bg-success/10 text-success"
                  >
                    Active
                  </Badge>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">スループット:</span>
                    <span className="text-foreground">{flow.throughput}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">レイテンシ:</span>
                    <span className="text-foreground">{flow.latency}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* S3 Bucket Structure */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">S3バケット構成</CardTitle>
          <CardDescription>
            s3://technomart-datalake/ のディレクトリ構造
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {s3Buckets.map((bucket) => (
              <div
                key={bucket.path}
                className="flex items-center justify-between rounded-lg border border-border p-3"
              >
                <div className="flex items-center gap-3">
                  <HardDrive className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="font-mono text-sm text-foreground">
                      {bucket.path}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {bucket.description}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <div className="text-right">
                    <p className="text-foreground">{bucket.objectCount} objects</p>
                    <p className="text-muted-foreground">{bucket.size}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-muted-foreground">最終同期</p>
                    <p className="text-foreground">{bucket.lastSync}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Architecture Note */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">アーキテクチャノート</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg bg-secondary p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-warning" />
              <div className="text-sm">
                <p className="font-medium text-foreground">本番環境との対応</p>
                <p className="mt-1 text-muted-foreground">
                  現在のローカル環境（LocalStack + k8s on VM）は本番AWS環境の縮小再現です。
                  Terraformのコードは本番移行時に最小限の変更で対応できるよう設計されています。
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">ローカル:</span>{" "}
                    <span className="text-foreground">LocalStack S3</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">本番:</span>{" "}
                    <span className="text-foreground">Amazon S3</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">ローカル:</span>{" "}
                    <span className="text-foreground">Kafka on k8s</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">本番:</span>{" "}
                    <span className="text-foreground">Amazon MSK</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
