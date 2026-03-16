"use client";

import type { CategoryAffinity } from "@/lib/types";

interface AffinityHeatmapProps {
  data: CategoryAffinity[];
}

/** avg_score を 0–1 正規化して背景色に変換 */
function scoreToColor(score: number, min: number, max: number): string {
  if (max === min) return "oklch(0.2 0 0)";
  const t = (score - min) / (max - min); // 0〜1
  // 低: 暗いグレー → 高: primary色（oklch 0.7 0.15 180）
  const l = 0.15 + t * 0.45;
  const c = t * 0.15;
  return `oklch(${l.toFixed(2)} ${c.toFixed(2)} 180)`;
}

export function AffinityHeatmap({ data }: AffinityHeatmapProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
        データがありません
      </div>
    );
  }

  // 軸を抽出
  const categories = [...new Set(data.map((d) => `cat_${d.category_id}`))].sort();
  const ageGroups  = [...new Set(data.map((d) => d.age_group))].sort();

  // 最新weekのみ表示
  const latestWeek = [...new Set(data.map((d) => d.week))].sort().at(-1);
  const latest = data.filter((d) => d.week === latestWeek);

  // cell lookup: `${age_group}:cat_${category_id}` → avg_score
  const lookup = new Map(latest.map((d) => [`${d.age_group}:cat_${d.category_id}`, d.avg_score]));

  const scores = latest.map((d) => d.avg_score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);

  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-collapse">
        <thead>
          <tr>
            <th className="p-2 text-left text-muted-foreground font-normal min-w-20">
              年齢層 ↓ / カテゴリ →
            </th>
            {categories.map((cat) => (
              <th
                key={cat}
                className="p-2 text-center text-muted-foreground font-normal min-w-16"
              >
                {cat}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ageGroups.map((age) => (
            <tr key={age}>
              <td className="p-2 text-muted-foreground">{age}</td>
              {categories.map((cat) => {
                const score = lookup.get(`${age}:${cat}`);
                return (
                  <td
                    key={cat}
                    className="p-2 text-center font-mono rounded"
                    style={{
                      backgroundColor: score != null ? scoreToColor(score, min, max) : "transparent",
                      color: score != null && score > (min + max) / 2 ? "oklch(0.95 0 0)" : "oklch(0.65 0 0)",
                    }}
                  >
                    {score != null ? score.toFixed(2) : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {latestWeek && (
        <p className="mt-2 text-xs text-muted-foreground">集計期間: {latestWeek} 週</p>
      )}
    </div>
  );
}
