import Link from "next/link";
import type { Locale } from "@/types";
import { cn } from "@/lib/utils";
import { Ltr, Money } from "@/components/shared/bidi";

export interface StatementRow { key: string; label: string; code?: string | null; href?: string; amount: bigint }
export interface StatementSection { key: string; title?: string; rows: StatementRow[]; total?: { label: string; amount: bigint }; strong?: boolean }

/** A financial statement: sections of rows with totals. */
export function Statement({ sections, locale, caption }: { sections: StatementSection[]; locale: Locale; caption: string }) {
  return (
    <section aria-label={caption} className="divide-y overflow-clip rounded-2xl border bg-card shadow-card print:border-0 print:shadow-none">
      {sections.map((s) => (
        <div key={s.key} className={cn("px-5 py-4", s.strong && "bg-[linear-gradient(to_right,var(--accent),color-mix(in_srgb,var(--accent),var(--card)_65%))] rtl:bg-[linear-gradient(to_left,var(--accent),color-mix(in_srgb,var(--accent),var(--card)_65%))]")}>
          {s.title && <h3 className="mb-2 text-sm font-semibold text-primary">{s.title}</h3>}
          <dl className="grid gap-1.5 text-sm">
            {s.rows.map((r) => (
              <div key={r.key} className="-mx-3 flex items-baseline justify-between gap-4 rounded-lg px-3 py-0.5 transition-colors hover:bg-accent/50">
                <dt className="min-w-0 break-words">{r.href ? <Link href={r.href} className="hover:text-primary hover:underline">{r.label}</Link> : r.label}{r.code && <Ltr className="ms-2 font-mono text-xs text-muted-foreground">{r.code}</Ltr>}</dt>
                <dd className="shrink-0"><Money amount={r.amount} locale={locale} /></dd>
              </div>
            ))}
            {s.total && (
              <div className={cn("flex items-baseline justify-between gap-4 font-semibold text-navy", s.rows.length > 0 && "mt-1 border-t pt-2", s.strong && "text-lg tracking-[-0.01em]")}>
                <dt>{s.total.label}</dt><dd className="shrink-0"><Money amount={s.total.amount} locale={locale} /></dd>
              </div>
            )}
          </dl>
        </div>
      ))}
    </section>
  );
}
