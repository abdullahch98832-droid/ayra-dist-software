import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** One headline figure. `value` must come from the database; pass "—" when it is unknown. */
export function StatCard({
  label, value, icon: Icon, href, tone = "default", hint, footer,
}: {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  href?: string;
  tone?: "default" | "attention";
  hint?: React.ReactNode;
  /** Extra line under the hint, such as a comparison. */
  footer?: React.ReactNode;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg",
          tone === "attention" ? "bg-warning-soft text-warning" : "bg-accent text-accent-foreground"
        )}>
          <Icon className="size-4.5" aria-hidden />
        </span>
      </div>
      <p className="font-latin mt-2 text-2xl font-semibold break-words text-navy">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      {footer && <div className="mt-2">{footer}</div>}
    </>
  );
  const classes = "block rounded-xl border bg-card p-5 shadow-card";
  return href ? (
    <Link href={href} className={cn(classes, "transition-colors outline-none hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/40")}>{body}</Link>
  ) : <div className={classes}>{body}</div>;
}
