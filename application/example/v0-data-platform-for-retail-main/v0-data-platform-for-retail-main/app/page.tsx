"use client"

import { useState } from "react"
import { DashboardHeader } from "@/components/dashboard/header"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { OverviewPanel } from "@/components/dashboard/overview-panel"
import { KafkaPanel } from "@/components/dashboard/kafka-panel"
import { DatabasePanel } from "@/components/dashboard/database-panel"
import { PipelinePanel } from "@/components/dashboard/pipeline-panel"
import { ScoringPanel } from "@/components/dashboard/scoring-panel"
import { SchemaPanel } from "@/components/dashboard/schema-panel"

export type ActiveTab = "overview" | "kafka" | "database" | "pipeline" | "scoring" | "schema"

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview")

  const renderContent = () => {
    switch (activeTab) {
      case "overview":
        return <OverviewPanel />
      case "kafka":
        return <KafkaPanel />
      case "database":
        return <DatabasePanel />
      case "pipeline":
        return <PipelinePanel />
      case "scoring":
        return <ScoringPanel />
      case "schema":
        return <SchemaPanel />
      default:
        return <OverviewPanel />
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />
      <div className="flex">
        <DashboardSidebar activeTab={activeTab} onTabChange={setActiveTab} />
        <main className="flex-1 p-6 overflow-auto">
          {renderContent()}
        </main>
      </div>
    </div>
  )
}
