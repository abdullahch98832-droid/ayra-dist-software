"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import { useI18n } from "@/i18n/context";
import { fill } from "@/i18n/format";
import { SectionHeading } from "@/components/shared/section-heading";
import { EmptyState } from "@/components/shared/states";
import { Input } from "@/components/ui/input";

interface Group { key: string; title: string; hint: string; reports: { slug: string; title: string; hint: string; words: string; icon: React.ReactNode }[] }

/** All reports by area, with a search that narrows them while typing. */
export function ReportHub({ groups }: { groups: Group[] }) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const words = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = groups.map((g) => ({ ...g, reports: g.reports.filter((r) => words.every((w) => r.words.includes(w))) })).filter((g) => g.reports.length > 0);
  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div role="search" className="relative w-full sm:w-80">
          <Search aria-hidden className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={t.analytics.find} aria-label={t.analytics.find} className="ps-9" />
        </div>
        <nav aria-label={t.reports.title} className="flex flex-wrap gap-2">
          {shown.map((g) => <a key={g.key} href={`#${g.key}`} className="rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground outline-none transition hover:border-primary/40 hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/40">{g.title}</a>)}
        </nav>
      </div>
      {shown.length === 0 && <EmptyState title={t.analytics.noneFound} />}
      {shown.map((g) => (
        <section key={g.key} aria-labelledby={g.key} className="grid scroll-mt-24 gap-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <SectionHeading id={g.key} title={g.title} description={g.hint} />
            <p className="text-xs text-muted-foreground">{fill(t.analytics.count, { count: g.reports.length })}</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {g.reports.map((r) => (
              <li key={r.slug}>
                <Link href={`/reports/${r.slug}`} className="group/report lift flex h-full items-start gap-3.5 rounded-2xl border bg-card p-4 shadow-card outline-none focus-visible:ring-3 focus-visible:ring-ring/40">
                  {r.icon}
                  <span className="min-w-0 flex-1"><span className="block font-semibold text-navy">{r.title}</span><span className="mt-0.5 block text-sm text-muted-foreground">{r.hint}</span></span>
                  <ArrowRight aria-hidden className="mt-1 size-4 shrink-0 text-muted-foreground/60 transition group-hover/report:translate-x-0.5 group-hover/report:text-primary rtl:-scale-x-100" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
