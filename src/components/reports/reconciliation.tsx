import { ChevronDown, CircleCheck, TriangleAlert } from "lucide-react";
import { reconciles, type ReportCheck } from "@/features/reports/model";
import type { Dictionary } from "@/i18n";
import { cn } from "@/lib/utils";
import type { Locale } from "@/types";
import { Money } from "@/components/shared/bidi";

/** Totals of a report beside the general ledger. Open at once when they differ. */
export function Reconciliation({ checks, t, locale }: { checks: ReportCheck[]; t: Dictionary; locale: Locale }) {
  const a = t.analytics;
  const good = checks.every(reconciles);
  const Icon = good ? CircleCheck : TriangleAlert;
  return (
    <details open={!good} className={cn("group/check rounded-2xl border shadow-card", good ? "border-success/25 bg-success-soft" : "border-destructive/25 bg-destructive-soft")}>
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl px-5 py-3.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40 [&::-webkit-details-marker]:hidden">
        <Icon aria-hidden className={cn("size-5 shrink-0", good ? "text-success" : "text-destructive")} />
        <span className="min-w-0 flex-1 font-medium text-navy">{good ? a.allAgree : a.notAgree}</span>
        <ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground transition group-open/check:rotate-180" />
      </summary>
      <div className="grid gap-3 border-t border-inherit bg-card px-5 py-4 rounded-b-2xl">
        <p className="text-xs text-muted-foreground">{a.reconciliationHint}</p>
        <ul className="grid gap-3">
          {checks.map((c, i) => (
            <li key={i} className="grid gap-2 border-t pt-3 first:border-0 first:pt-0">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-navy"><bdi>{c.label[locale]}</bdi><span className={cn("text-xs font-normal", reconciles(c) ? "text-success" : "text-destructive")}>{reconciles(c) ? a.agrees : a.differs}</span></p>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                {([[a.thisReport, c.report], [a.otherEntries, c.other], [a.ledger, c.ledger], [a.difference, c.report + c.other - c.ledger]] as const).map(([label, value]) => (
                  <div key={label} className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd><Money amount={value} locale={locale} className="font-medium break-words" /></dd></div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
