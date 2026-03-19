"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Radio,
  GitBranch,
  Activity,
  TableProperties,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/ops/overview",  label: "概要",          icon: LayoutDashboard },
  { href: "/ops/kafka",     label: "Kafka",         icon: Radio },
  { href: "/ops/pipeline",  label: "パイプライン",  icon: GitBranch },
  { href: "/ops/scoring",   label: "スコアリング",  icon: Activity },
  { href: "/ops/schema",    label: "スキーマ",      icon: TableProperties },
  { href: "/ops/users",     label: "ユーザー管理",  icon: Users },
];

export function OpsSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 shrink-0 border-r border-border bg-sidebar min-h-[calc(100vh-57px)]">
      <nav className="p-3 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-primary font-medium"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mx-3 mt-4 rounded-md border border-border bg-card p-3 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">環境</p>
        <p>k3s · Local Dev</p>
        <p>Ubuntu 24.04 LTS</p>
      </div>
    </aside>
  );
}
