"use client";

import { useState } from "react";
import { ChartCard, ChartTooltip } from "./chart-card";
import { SERIES_COLORS, axisTicks, type ChartPoint, type ChartSeries } from "./types";

/**
 * Vertical columns, grouped when there is more than one series. Built with flow
 * layout, so in Urdu the first category and the axis sit on the right.
 */
export function ColumnChartCard({
  title, description, categoryLabel, series, points, formatTick = String,
}: {
  title: string;
  description?: string;
  categoryLabel?: string;
  series: ChartSeries[];
  points: ChartPoint[];
  formatTick?: (value: number) => string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const ticks = axisTicks(Math.max(...points.flatMap((p) => p.values.map((v) => v.value)), 0));
  const top = ticks[ticks.length - 1] ?? 1;
  const labelEvery = Math.ceil(points.length / 8);
  return (
    <ChartCard title={title} description={description} categoryLabel={categoryLabel} series={series} points={points}>
      <div className="flex gap-2">
        <div className="relative h-52 w-10 shrink-0 text-xs text-muted-foreground tabular-nums" aria-hidden>
          {ticks.map((tick) => (
            <bdi key={tick} dir="ltr" className="absolute end-0 translate-y-1/2 leading-none" style={{ insetBlockEnd: `${(tick / top) * 100}%` }}>{formatTick(tick)}</bdi>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative h-52">
            {ticks.map((tick) => (
              <div key={tick} className="absolute inset-x-0 h-px bg-border" style={{ insetBlockEnd: `${(tick / top) * 100}%` }} aria-hidden />
            ))}
            <div className="absolute inset-0 flex items-stretch">
              {points.map((p, index) => (
                <button
                  key={p.label}
                  type="button"
                  onPointerEnter={() => setActive(index)}
                  onPointerLeave={() => setActive(null)}
                  onFocus={() => setActive(index)}
                  onBlur={() => setActive(null)}
                  aria-label={`${p.label}: ${series.map((s, i) => `${s.label} ${p.values[i]?.display ?? "—"}`).join(", ")}`}
                  className="relative flex min-w-0 flex-1 cursor-default items-end justify-center gap-0.5 rounded-md px-0.5 outline-none hover:bg-muted/70 focus-visible:bg-muted/70"
                >
                  {series.map((s, i) => (
                    <span
                      key={s.key}
                      className="block min-w-1 max-w-6 flex-1 rounded-t-[4px]"
                      style={{ background: SERIES_COLORS[i], blockSize: `${((p.values[i]?.value ?? 0) / top) * 100}%` }}
                    />
                  ))}
                </button>
              ))}
            </div>
            {active !== null && points[active] && (
              <ChartTooltip
                point={points[active]}
                series={series}
                className="top-0"
                style={active < points.length / 2
                  ? { insetInlineStart: `${((active + 1) / points.length) * 100}%` }
                  : { insetInlineEnd: `${((points.length - active) / points.length) * 100}%` }}
              />
            )}
          </div>
          <div className="mt-2 flex text-xs text-muted-foreground" aria-hidden>
            {points.map((p, i) => (
              <span key={p.label} className="min-w-0 flex-1 text-center break-words">{i % labelEvery === 0 ? p.label : ""}</span>
            ))}
          </div>
        </div>
      </div>
    </ChartCard>
  );
}
