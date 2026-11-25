import { Children } from "react";

/** Cards per row on wide screens, so that every row is full. */
export function rowsOf(count: number): number[] {
  if (count <= 2) return count === 0 ? [] : [count];
  if (count === 5) return [2, 3];
  // Rows of four, with as many rows of three as the rest needs.
  const threes = (4 - (count % 4)) % 4;
  return [...Array<number>(threes).fill(3), ...Array<number>((count - threes * 3) / 4).fill(4)];
}

const SPAN: Record<number, string> = { 1: "xl:col-span-12", 2: "xl:col-span-6", 3: "xl:col-span-4", 4: "xl:col-span-3" };

/** Grid of stat cards without gaps in its last row, whatever the user may see. */
export function StatGrid({ children }: { children: React.ReactNode }) {
  const cards = Children.toArray(children);
  const spans = rowsOf(cards.length).flatMap((n) => Array<number>(n).fill(n));
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-12">
      {/* On two columns an odd last card takes the whole row. */}
      {cards.map((card, i) => <div key={i} className={`min-w-0 ${SPAN[spans[i] ?? 4]} ${i === cards.length - 1 && cards.length % 2 === 1 ? "sm:col-span-2" : ""}`}>{card}</div>)}
    </div>
  );
}
