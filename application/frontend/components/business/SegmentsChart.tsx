"use client";

import {
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
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
import type { SegmentSummary, SegmentTrend } from "@/lib/types";

const SEGMENT_CONFIG = {
  active:  { label: "アクティブ", color: "var(--chart-1)" },
  dormant: { label: "休眠",       color: "var(--chart-2)" },
  churned: { label: "チャーン",   color: "var(--chart-4)" },
} satisfies ChartConfig;

const FALLBACK_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

interface PieProps {
  data: SegmentSummary[];
}

export function SegmentPieChart({ data }: PieProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
        データがありません
      </div>
    );
  }

  const config: ChartConfig = Object.fromEntries(
    data.map((d, i) => [
      d.label,
      {
        label: SEGMENT_CONFIG[d.label as keyof typeof SEGMENT_CONFIG]?.label ?? d.label,
        color: SEGMENT_CONFIG[d.label as keyof typeof SEGMENT_CONFIG]?.color
          ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length],
      },
    ])
  );

  return (
    <ChartContainer config={config} className="h-56 w-full">
      <PieChart>
        <Pie
          data={data}
          dataKey="count"
          nameKey="label"
          cx="50%"
          cy="50%"
          outerRadius={80}
          label={({ label, percentage }) =>
            `${SEGMENT_CONFIG[label as keyof typeof SEGMENT_CONFIG]?.label ?? label} ${percentage.toFixed(1)}%`
          }
          labelLine={false}
        >
          {data.map((entry, i) => (
            <Cell
              key={entry.label}
              fill={`var(--color-${entry.label})`}
              style={{ "--color-fallback": FALLBACK_COLORS[i % FALLBACK_COLORS.length] } as React.CSSProperties}
            />
          ))}
        </Pie>
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
      </PieChart>
    </ChartContainer>
  );
}

interface TrendProps {
  data: SegmentTrend[];
}

export function SegmentTrendChart({ data }: TrendProps) {
  // week × label でピボット
  const byWeek = new Map<string, Record<string, number>>();
  for (const row of data) {
    const entry = byWeek.get(row.week) ?? {};
    entry[row.label] = row.customer_count;
    byWeek.set(row.week, entry);
  }
  const labels = [...new Set(data.map((d) => d.label))];
  const chartData = [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, vals]) => ({ week: week.slice(5), ...vals }));

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
        データがありません
      </div>
    );
  }

  const config: ChartConfig = Object.fromEntries(
    labels.map((label, i) => [
      label,
      {
        label: SEGMENT_CONFIG[label as keyof typeof SEGMENT_CONFIG]?.label ?? label,
        color: SEGMENT_CONFIG[label as keyof typeof SEGMENT_CONFIG]?.color
          ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length],
      },
    ])
  );

  return (
    <ChartContainer config={config} className="h-56 w-full">
      <LineChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="week" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
        <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        {labels.map((label) => (
          <Line
            key={label}
            type="monotone"
            dataKey={label}
            stroke={`var(--color-${label})`}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}
