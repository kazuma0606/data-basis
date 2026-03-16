"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  PieChart,
  Flame,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/business/summary",   label: "サマリ",       icon: LayoutDashboard },
  { href: "/business/customers", label: "顧客一覧",     icon: Users },
  { href: "/business/segments",  label: "セグメント",   icon: PieChart },
  { href: "/business/affinity",  label: "カテゴリ親和性", icon: Flame },
  { href: "/business/query",     label: "自然言語クエリ", icon: MessageSquare },
];

export function BusinessSidebar() {
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
    </aside>
  );
}
