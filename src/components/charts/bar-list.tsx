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
                <bdi dir="ltr" className="font-semibold tabular-nums">{p.values[0]?.display}</bdi>
              </div>
              <div className="h-2.5 rounded-e-[4px] bg-muted">
                <div
                  className="h-full rounded-e-[4px] bg-chart-1 transition-[filter] group-hover:brightness-110"
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
