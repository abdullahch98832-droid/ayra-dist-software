import type { Metadata } from "next";
import { z } from "zod";
import { CircleAlert } from "lucide-react";
import { closePeriodAction, reopenPeriodAction } from "@/features/accounting/actions";
import { loadChecklist, loadPeriods, seesLedgers, seesStatements } from "@/features/accounting/queries";
import { businessToday } from "@/features/dashboard/period";
import { fill, isolate } from "@/i18n/format";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { formatPaisa, toPaisa } from "@/lib/utils/money";
import { ActionButton } from "@/components/documents/action-button";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { Ltr } from "@/components/shared/bidi";
import { formatBucket, formatDateTime, formatNumber } from "@/components/shared/format";
import { EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { AddPeriod } from "./add-period";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).accounting.periods };
}

const totals = z.object({ debit: z.string(), credit: z.string(), result: z.string() }).nullable().catch(null);

export default async function PeriodsPage() {
  const { ctx, t, locale } = await pageContext();
  const close = can(ctx, "accounting.close");
  if (!close && !seesLedgers(ctx) && !seesStatements(ctx)) return <Forbidden />;
  const a = t.accounting;
  const periods = await loadPeriods();
  // Only the oldest open month can be the next to close.
  const next = [...periods].reverse().find((p) => p.status === "open");
  const latest = periods.find((p) => p.status === "closed");
  const checklist = close && next ? await loadChecklist(next.id) : [];
  return (
    <>
      <PageHeader title={a.periods} description={a.periodsHint} />
      <div className="grid gap-6">
        {close && <AddPeriod month={businessToday().slice(0, 7)} />}
        {periods.length === 0 ? <EmptyState title={a.periodEmpty} /> : (
          <ul className="divide-y rounded-2xl border bg-card shadow-card">
            {periods.map((p) => {
              const x = totals.parse(p.closing_totals);
              return (
                <li key={p.id} className="grid gap-3 px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-navy">{formatBucket(p.start_date, "month", locale)}</p>
                      <p className="text-xs text-muted-foreground">{p.status === "closed" && p.closed_at ? <bdi>{formatDateTime(p.closed_at, locale)}</bdi> : p.reopen_reason ? fill(a.reopenedNote, { reason: isolate(p.reopen_reason) }) : null}{p.status === "closed" && x && <> · {a.resultOf}: <Ltr>{formatPaisa(toPaisa(x.result), locale)}</Ltr></>}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <StatusBadge tone={p.status === "closed" ? "gray" : "green"}>{a.periodStatus[p.status]}</StatusBadge>
                      {close && p.id === next?.id && checklist.length === 0 && <ActionButton label={a.closePeriod} action={closePeriodAction.bind(null, p.id)} success={a.periodClosed} confirm={{ title: a.closeTitle, description: a.closeHint }} />}
                      {close && p.id === latest?.id && <ActionButton label={a.reopenPeriod} variant="outline" action={reopenPeriodAction.bind(null, p.id)} reasonLabel={t.documents.reason} success={a.periodReopened} confirm={{ title: a.reopenTitle, description: a.reopenHint, tone: "danger" }} />}
                    </div>
                  </div>
                  {close && p.id === next?.id && checklist.length > 0 && (
                    <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">
                      <p className="mb-2 font-medium">{a.checklist}</p>
                      <ul className="grid gap-1.5">
                        {checklist.map((c) => <li key={c.check_code} className="flex items-start gap-2"><CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden /><span className="min-w-0">{(a.checklistItems as Record<string, string>)[c.check_code] ?? c.check_code}{Number(c.found) > 1 && <> (<Ltr>{formatNumber(Number(c.found), locale)}</Ltr>)</>}</span></li>)}
                      </ul>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
