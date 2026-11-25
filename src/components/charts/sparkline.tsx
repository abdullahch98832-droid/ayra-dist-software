/** Shape of a series beside its figure. Decoration only: the figure and the chart below carry the values. Time runs in the reading direction. */
export function Sparkline({ values, className }: { values: readonly number[]; className?: string }) {
  if (values.length < 2 || values.every((v) => v === values[0])) return null;
  const low = Math.min(...values);
  const high = Math.max(...values);
  const points = values.map((v, i) => `${((i / (values.length - 1)) * 100).toFixed(2)},${(34 - ((v - low) / (high - low)) * 32).toFixed(2)}`);
  return (
    <svg viewBox="0 0 100 36" preserveAspectRatio="none" aria-hidden className={`rtl:-scale-x-100 ${className ?? ""}`}>
      {low >= 0 && <polygon points={`0,36 ${points.join(" ")} 100,36`} fill="var(--chart-1)" fillOpacity="0.1" />}
      <polyline points={points.join(" ")} fill="none" stroke="var(--chart-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
