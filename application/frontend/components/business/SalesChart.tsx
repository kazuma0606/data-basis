"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { SalesByChannel } from "@/lib/types";

interface SalesChartProps {
  data: SalesByChannel[];
}

/** チャネル別日次売上をバーチャートで表示 */
export function SalesChart({ data }: SalesChartProps) {
  // 日付×チャネルで集計
  const byDate = new Map<string, Record<string, number>>();
  for (const row of data) {
    const entry = byDate.get(row.date) ?? {};
    entry[row.channel] = (entry[row.channel] ?? 0) + row.total_amount;
    byDate.set(row.date, entry);
  }

  const channels = [...new Set(data.map((d) => d.channel))];
  const chartData = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14) // 直近14日
    .map(([date, vals]) => ({
      date: date.slice(5), // "MM-DD"
      ...vals,
    }));

  const COLORS = ["oklch(0.7 0.15 180)", "oklch(0.75 0.15 85)", "oklch(0.65 0.2 280)"];

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
        売上データがありません
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0 0)" />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "oklch(0.65 0 0)" }} />
        <YAxis
          tick={{ fontSize: 11, fill: "oklch(0.65 0 0)" }}
          tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "oklch(0.14 0 0)",
            border: "1px solid oklch(0.25 0 0)",
            borderRadius: "6px",
            fontSize: 12,
          }}
          formatter={(value: number) => [`¥${value.toLocaleString("ja-JP")}`, ""]}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {channels.map((ch, i) => (
          <Bar key={ch} dataKey={ch} name={ch} fill={COLORS[i % COLORS.length]} radius={[2, 2, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
