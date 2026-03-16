"use client"

import {
  LayoutDashboard,
  Radio,
  Database,
  GitBranch,
  Activity,
  TableProperties,
} from "lucide-react"
import { cn } from "@/lib/utils"
export type ActiveTab = "overview" | "kafka" | "database" | "pipeline" | "scoring" | "schema"

interface SidebarProps {
  activeTab: ActiveTab
  onTabChange: (tab: ActiveTab) => void
}

const navItems = [
  {
    id: "overview" as const,
    label: "概要",
    icon: LayoutDashboard,
    description: "システム全体の状態",
  },
  {
    id: "kafka" as const,
    label: "Kafka",
    icon: Radio,
    description: "ストリーミング",
  },
  {
    id: "database" as const,
    label: "データベース",
    icon: Database,
    description: "PostgreSQL / ClickHouse",
  },
  {
    id: "pipeline" as const,
    label: "パイプライン",
    icon: GitBranch,
    description: "データフロー",
  },
  {
    id: "scoring" as const,
    label: "スコアリング",
    icon: Activity,
    description: "バッチ実行状況",
  },
  {
    id: "schema" as const,
    label: "スキーマ",
    icon: TableProperties,
    description: "テーブル定義",
  },
]

export function DashboardSidebar({ activeTab, onTabChange }: SidebarProps) {
  return (
    <aside className="w-64 min-h-[calc(100vh-61px)] border-r border-border bg-sidebar">
      <nav className="p-4">
        <div className="mb-4">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            モニタリング
          </span>
        </div>
        <ul className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = activeTab === item.id
            return (
              <li key={item.id}>
                <button
                  onClick={() => onTabChange(item.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  )}
                >
                  <Icon className={cn("h-4 w-4", isActive && "text-primary")} />
                  <div className="flex flex-col items-start">
                    <span className="font-medium">{item.label}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {item.description}
                    </span>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>

        <div className="mt-8 rounded-lg border border-border bg-card p-4">
          <h4 className="text-sm font-medium text-foreground">環境情報</h4>
          <div className="mt-3 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">環境</span>
              <span className="text-foreground">LocalStack</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">k8s</span>
              <span className="text-success">Running</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">VM</span>
              <span className="text-foreground">Ubuntu 24.04</span>
            </div>
          </div>
        </div>
      </nav>
    </aside>
  )
}
