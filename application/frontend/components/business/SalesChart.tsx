"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { SalesByChannel } from "@/lib/types";

interface SalesChartProps {
  data: SalesByChannel[];
}

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

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
    .slice(-14)
    .map(([date, vals]) => ({ date: date.slice(5), ...vals }));

  const chartConfig = Object.fromEntries(
    channels.map((ch, i) => [
      ch,
      { label: ch, color: CHART_COLORS[i % CHART_COLORS.length] },
    ])
  ) satisfies ChartConfig;

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
        売上データがありません
      </div>
    );
  }

  return (
    <ChartContainer config={chartConfig} className="h-56 w-full">
      <BarChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11 }}
          tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) => [`¥${Number(value).toLocaleString("ja-JP")}`, ""]}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        {channels.map((ch) => (
          <Bar
            key={ch}
            dataKey={ch}
            fill={`var(--color-${ch})`}
            radius={[2, 2, 0, 0]}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}
