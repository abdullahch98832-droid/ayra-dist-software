import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconTile, toneOf, type Tone } from "./icon-tile";

/** Soft light behind the icon, in the tone of the card. */
const GLOW: Record<Tone, string> = {
  blue: "var(--tone-blue-soft)", indigo: "var(--tone-indigo-soft)", sky: "var(--tone-sky-soft)", teal: "var(--tone-teal-soft)", slate: "var(--tone-slate-soft)",
  attention: "var(--warning-soft)", danger: "var(--destructive-soft)",
};

/** One headline figure. `value` must come from the database; pass "—" when it is unknown. */
export function StatCard({
  label, value, icon, href, tone = "default", hint, footer, visual,
}: {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  href?: string;
  tone?: "default" | "attention";
  hint?: React.ReactNode;
  /** Extra line under the hint, such as a comparison. */
  footer?: React.ReactNode;
  /** Small drawing at the bottom edge, such as a sparkline. */
  visual?: React.ReactNode;
}) {
  const colour = tone === "attention" ? "attention" : toneOf(icon);
  const body = (
    <>
      <span
        aria-hidden style={{ "--glow": GLOW[colour] } as React.CSSProperties}
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(16rem_9rem_at_100%_0%,var(--glow),transparent_75%)] rtl:-scale-x-100 print:hidden"
      />
      <div className="relative flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <IconTile icon={icon} tone={colour} />
      </div>
      <p className="font-latin relative mt-1 text-[1.6rem] leading-tight font-semibold tracking-[-0.02em] break-words text-navy">{value}</p>
      {hint && <p className="relative mt-1.5 text-xs text-muted-foreground">{hint}</p>}
      {(footer || visual) && (
        <div className="relative mt-auto flex items-end justify-between gap-3 pt-3">
          <div className="shrink-0">{footer}</div>
          {visual}
        </div>
      )}
      {href && <ArrowUpRight aria-hidden className="absolute end-4 bottom-4 size-4 text-primary opacity-0 transition-opacity group-hover/stat:opacity-100 rtl:-scale-x-100 print:hidden" />}
    </>
  );
  const classes = "relative flex h-full flex-col overflow-hidden rounded-2xl border bg-card p-5 shadow-card";
  return href ? (
    <Link href={href} className={cn(classes, "group/stat lift outline-none focus-visible:ring-3 focus-visible:ring-ring/40")}>{body}</Link>
  ) : <div className={classes}>{body}</div>;
}
