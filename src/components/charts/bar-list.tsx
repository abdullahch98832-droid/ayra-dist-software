"use client";

import { ChartCard } from "./chart-card";
import type { ChartPoint, ChartSeries } from "./types";

/** Ranked horizontal bars for one measure. Bars grow from the reading-start edge. */
export function BarListCard({
  title, description, categoryLabel, series, points, emptyText,
}: {
  title: string;
  description?: string;
  categoryLabel?: string;
  series: ChartSeries;
  points: ChartPoint[];
  emptyText?: string;
}) {
  const total = points.reduce((sum, p) => sum + (p.values[0]?.value ?? 0), 0);
  const max = Math.max(...points.map((p) => p.values[0]?.value ?? 0), 0);
  return (
    <ChartCard title={title} description={description} categoryLabel={categoryLabel} series={[series]} points={points} emptyText={emptyText}>
      <ul className="grid gap-3.5">
        {points.map((p) => {
          const value = p.values[0]?.value ?? 0;
          return (
            <li key={p.label} className="group grid gap-1.5 text-sm">
              <div className="flex items-baseline justify-between gap-4">
                <span className="min-w-0 break-words">{p.label}</span>
                <span className="flex shrink-0 items-baseline gap-2.5">
                  <bdi dir="ltr" className="font-semibold tabular-nums">{p.values[0]?.display}</bdi>
                  {total > 0 && <bdi dir="ltr" className="w-11 text-end text-xs text-muted-foreground tabular-nums">{Math.round((value / total) * 100)}%</bdi>}
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-chart-1 transition-[filter,inline-size] duration-500 group-hover:brightness-110"
                  style={{ inlineSize: max > 0 ? `${(value / max) * 100}%` : 0 }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </ChartCard>
  );
}
