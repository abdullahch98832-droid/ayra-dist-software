"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/context";
import { ChartCard, ChartTooltip } from "./chart-card";
import { SERIES_COLORS, axisScale, formatTick, type ChartPoint, type ChartSeries } from "./types";

const HEIGHT = 208;

/** Change over time. Time runs in the reading direction: right to left in Urdu. */
export function LineChartCard({
  title, description, categoryLabel, series, points, emptyText,
}: {
  title: string;
  description?: string;
  categoryLabel?: string;
  series: ChartSeries[];
  points: ChartPoint[];
  emptyText?: string;
}) {
  const { direction } = useI18n();
  const plot = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const element = plot.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const { ticks, low, high } = axisScale(points.flatMap((p) => p.values.map((v) => v.value)));
  const last = points.length - 1;
  const x = (index: number) => {
    const fromStart = last > 0 ? 6 + (index / last) * Math.max(width - 12, 0) : width / 2;
    return direction === "rtl" ? width - fromStart : fromStart;
  };
  const y = (value: number) => HEIGHT - ((value - low) / (high - low)) * HEIGHT;

  const pick = (clientX: number) => {
    const box = plot.current?.getBoundingClientRect();
    if (!box || last < 0) return;
    const distance = direction === "rtl" ? box.right - clientX : clientX - box.left;
    setActive(Math.min(last, Math.max(0, Math.round((distance / Math.max(box.width, 1)) * last))));
  };
  const labelEvery = Math.ceil(points.length / 6);
  const current = active === null ? undefined : points[active];

  return (
    <ChartCard title={title} description={description} categoryLabel={categoryLabel} series={series} points={points} emptyText={emptyText}>
      <div className="flex gap-2">
        <div className="relative w-10 shrink-0 text-xs text-muted-foreground tabular-nums" style={{ height: HEIGHT }} aria-hidden>
          {ticks.map((tick) => (
            <bdi key={tick} dir="ltr" className="absolute end-0 translate-y-1/2 leading-none" style={{ insetBlockEnd: `${((tick - low) / (high - low)) * 100}%` }}>{formatTick(tick)}</bdi>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div
            ref={plot}
            role="img"
            tabIndex={0}
            aria-label={`${title}. ${points.map((p) => `${p.label}: ${p.values.map((v) => v.display).join(", ")}`).join("; ")}`}
            className="relative touch-pan-y rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
            style={{ height: HEIGHT }}
            onPointerMove={(e) => pick(e.clientX)}
            onPointerLeave={() => setActive(null)}
            onBlur={() => setActive(null)}
            onKeyDown={(e) => {
              const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
              if (!step) return;
              e.preventDefault();
              setActive((i) => Math.min(last, Math.max(0, (i ?? (step > 0 ? -1 : last + 1)) + (direction === "rtl" ? -step : step))));
            }}
          >
            {width > 0 && (
              <svg width={width} height={HEIGHT} className="block overflow-visible" aria-hidden>
                {ticks.map((tick) => <line key={tick} x1={0} x2={width} y1={y(tick)} y2={y(tick)} stroke={tick === 0 ? "var(--input)" : "var(--border)"} />)}
                {active !== null && <line x1={x(active)} x2={x(active)} y1={0} y2={HEIGHT} stroke="var(--input)" />}
                {series.map((s, i) => (
                  <g key={s.key}>
                    <polyline
                      fill="none" stroke={SERIES_COLORS[i]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
                      points={points.map((p, index) => `${x(index)},${y(p.values[i]?.value ?? 0)}`).join(" ")}
                    />
                    <circle
                      cx={x(active ?? last)} cy={y(points[active ?? last]?.values[i]?.value ?? 0)} r={4.5}
                      fill={SERIES_COLORS[i]} stroke="var(--card)" strokeWidth={2}
                    />
                  </g>
                ))}
              </svg>
            )}
            {current && active !== null && (
              <ChartTooltip
                point={current} series={series} className="top-0"
                style={active < points.length / 2
                  ? { insetInlineStart: (direction === "rtl" ? width - x(active) : x(active)) + 12 }
                  : { insetInlineEnd: (direction === "rtl" ? x(active) : width - x(active)) + 12 }}
              />
            )}
          </div>
          <div className="relative mt-2 h-6 text-xs text-muted-foreground" aria-hidden>
            {points.map((p, i) => i % labelEvery === 0 && (
              <span
                key={p.label}
                className="absolute -translate-x-1/2 whitespace-nowrap rtl:translate-x-1/2"
                style={{ insetInlineStart: last > 0 ? `${(i / last) * 100}%` : "50%" }}
              >
                {p.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </ChartCard>
  );
}
