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

export interface AxisScale {
  ticks: number[];
  low: number;
  high: number;
}

/** Round ticks that always include zero and cover the data, for example -20, 0, 20, 40. */
export function axisScale(values: readonly number[], count = 4): AxisScale {
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  if (max === min) return { ticks: [0, 1], low: 0, high: 1 };
  const rough = (max - min) / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * magnitude >= rough) ?? 10) * magnitude;
  const first = Math.floor(min / step);
  const last = Math.ceil(max / step);
  const ticks = Array.from({ length: last - first + 1 }, (_, i) => (first + i) * step);
  return { ticks, low: first * step, high: last * step };
}

/** Short axis label: 950, 12K, 1.5M. Exact values are in the tooltip and the table. */
export function formatTick(value: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
