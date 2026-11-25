import { Ban, Check } from "lucide-react";
import { ORDER_STEPS } from "@/features/sol/status";
import type { Dictionary } from "@/i18n";
import { cn } from "@/lib/utils";

/** A distributor order from the call to the payment. Scrolls sideways inside itself on phones. */
export function DistributorSteps({ step, t }: { step: string; t: Dictionary }) {
  const o = t.distributor;
  if (step === "cancelled") {
    return <p className="flex items-center gap-2 rounded-2xl border bg-card px-5 py-4 text-sm text-muted-foreground shadow-card print:hidden"><Ban className="size-4" aria-hidden />{o.steps.cancelled}</p>;
  }
  // Every step up to the present one is done; a draft has not begun.
  const reached = ORDER_STEPS.indexOf(step as (typeof ORDER_STEPS)[number]);
  return (
    <nav aria-label={o.progress} className="no-scrollbar overflow-x-auto rounded-2xl border bg-card px-5 py-4 shadow-card print:hidden">
      <ol className="flex min-w-max items-center gap-2">
        {ORDER_STEPS.map((s, i) => {
          const done = i <= reached;
          const next = i === reached + 1;
          return (
            <li key={s} aria-current={i === reached ? "step" : undefined} className="flex items-center gap-2">
              {i > 0 && <span className={cn("h-px w-5 lg:w-8", done ? "bg-primary" : "bg-border")} aria-hidden />}
              <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold", done ? "bg-primary text-primary-foreground" : next ? "border-2 border-primary text-primary" : "border text-muted-foreground")}>
                {done ? <Check className="size-3.5" aria-hidden /> : <span className="font-latin">{i + 1}</span>}
              </span>
              <span className={cn("text-sm whitespace-nowrap", i === reached ? "font-semibold text-primary" : done ? "text-foreground" : "text-muted-foreground")}>{o.steps[s]}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
