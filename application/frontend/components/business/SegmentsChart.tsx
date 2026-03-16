"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import type { SegmentSummary, SegmentTrend } from "@/lib/types";

const SEGMENT_COLORS: Record<string, string> = {
  active:  "oklch(0.7 0.15 180)",
  dormant: "oklch(0.75 0.15 85)",
  churned: "oklch(0.6 0.2 25)",
};
const FALLBACK_COLORS = [
  "oklch(0.7 0.15 180)",
  "oklch(0.75 0.15 85)",
  "oklch(0.65 0.2 280)",
  "oklch(0.7 0.2 25)",
];

const TOOLTIP_STYLE = {
  backgroundColor: "oklch(0.14 0 0)",
  border: "1px solid oklch(0.25 0 0)",
  borderRadius: "6px",
  fontSize: 12,
};

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
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          dataKey="count"
          nameKey="label"
          cx="50%"
          cy="50%"
          outerRadius={80}
          label={({ label, percentage }) =>
            `${label} ${percentage.toFixed(1)}%`
          }
          labelLine={false}
        >
          {data.map((entry, i) => (
            <Cell
              key={entry.label}
              fill={SEGMENT_COLORS[entry.label] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]}
            />
          ))}
        </Pie>
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
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

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0 0)" />
        <XAxis dataKey="week" tick={{ fontSize: 11, fill: "oklch(0.65 0 0)" }} />
        <YAxis tick={{ fontSize: 11, fill: "oklch(0.65 0 0)" }} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {labels.map((label, i) => (
          <Line
            key={label}
            type="monotone"
            dataKey={label}
            stroke={SEGMENT_COLORS[label] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
