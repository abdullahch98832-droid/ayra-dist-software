/** `value` only sets mark size; `display` is the exact, already formatted text. */
export interface ChartPoint {
  label: string;
  values: { value: number; display: string }[];
}

export interface ChartSeries {
  key: string;
  label: string;
}

/** Fixed categorical order. A sixth series is folded into "other" by the caller, never given a new colour. */
export const SERIES_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"] as const;

/** Round axis ticks from zero: 0, 25, 50, 75, 100. */
export function axisTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0, 1];
  const rough = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * magnitude >= rough) ?? 10) * magnitude;
  const ticks = [];
  for (let i = 0; i * step < max + step; i++) ticks.push(i * step);
  return ticks;
}
