import { Ban, Check } from "lucide-react";
import { ORDER_STEPS, stepIndex } from "@/features/sales/status";
import type { Dictionary } from "@/i18n";
import { cn } from "@/lib/utils";

/** Where an order stands. Scrolls sideways inside itself on phones. */
export function OrderSteps({ status, t }: { status: string; t: Dictionary }) {
  if (status === "cancelled") {
    return <p className="flex items-center gap-2 rounded-2xl border bg-card px-5 py-4 text-sm text-muted-foreground shadow-card print:hidden"><Ban className="size-4" aria-hidden />{t.sales.statuses.cancelled}</p>;
  }
  const current = stepIndex(status);
  const finished = status === "completed";
  return (
    <nav aria-label={t.sales.steps} className="no-scrollbar overflow-x-auto rounded-2xl border bg-card px-5 py-4 shadow-card print:hidden">
      <ol className="flex min-w-max items-center gap-2">
        {ORDER_STEPS.map((step, i) => {
          const done = i < current || finished;
          const active = i === current && !finished;
          return (
            <li key={step} aria-current={active ? "step" : undefined} className="flex items-center gap-2">
              {i > 0 && <span className={cn("h-px w-5 lg:w-8", i <= current ? "bg-primary" : "bg-border")} aria-hidden />}
              <span className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                done ? "bg-primary text-primary-foreground" : active ? "border-2 border-primary text-primary" : "border text-muted-foreground"
              )}>
                {done ? <Check className="size-3.5" aria-hidden /> : <span className="font-latin">{i + 1}</span>}
              </span>
              <span className={cn("text-sm whitespace-nowrap", active ? "font-semibold text-primary" : done ? "text-foreground" : "text-muted-foreground")}>
                {active && status === "partially_dispatched" ? t.sales.statuses.partially_dispatched : t.sales.statuses[step]}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
