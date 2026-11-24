import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { loadJournal, seesLedgers, sourceHref, sourceLabel } from "@/features/accounting/queries";
import { businessToday, parsePeriod } from "@/features/dashboard/period";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { LIST_PAGE, listParams } from "@/lib/list-params";
import { pageContext } from "@/lib/page-context";
import { PeriodFrame } from "@/components/dashboard/period-frame";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { LinkButton } from "@/components/shared/link-button";
import { SpecTable } from "@/components/tables/spec-table";
import { UrlSearch, UrlSelect } from "@/components/tables/url-filters";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).accounting.tabs.journal };
}

export default async function JournalPage({ searchParams }: PageProps<"/accounting/journal">) {
  const { ctx, t } = await pageContext();
  if (!seesLedgers(ctx)) return <Forbidden />;
  const a = t.accounting;
  const query = await searchParams;
  const today = businessToday();
  const period = parsePeriod(query, today);
  const sources = Object.keys(a.sources).filter((s) => s !== "brought_forward");
  const source = typeof query.source === "string" && sources.includes(query.source) ? query.source : null;
  const filter = listParams(query, []);
  const { rows, total } = await loadJournal(period.from, period.to, source, filter.q, filter.page);
  return (
    <>
      <PageHeader title={a.tabs.journal} actions={can(ctx, "accounting.journal") && <LinkButton href="/accounting/journal/new"><Plus aria-hidden />{a.newJournal}</LinkButton>} />
      <PeriodFrame key={`${period.preset}-${period.from}-${period.to}`} period={period} today={today} title={a.tabs.journal} description={a.subtitle}>
        <SpecTable
          caption={a.tabs.journal}
          rows={rows.map((r) => ({ id: r.entry_id, no: r.doc_no, noHref: `/accounting/journal/${r.entry_id}`, flag: r.reversal_of ? a.reversal : r.reversed_by ? a.reversed : null, date: r.entry_date, source: sourceLabel(t, r.source_type), doc: r.source_no, docHref: sourceHref(r.source_type, r.source_id), description: r.description, amount: r.amount }))}
          columns={[
            { key: "no", sub: "flag", label: a.entry, kind: "link", primary: true }, { key: "date", label: a.date, kind: "date" }, { key: "doc", sub: "source", label: a.document, kind: "link" }, { key: "description", label: a.description, kind: "text", hideBelow: "lg" }, { key: "amount", label: t.expenses.amount, kind: "money" },
          ]}
          server={{ page: filter.page, pageSize: LIST_PAGE, total }}
          toolbar={<><UrlSearch placeholder={a.searchJournal} /><UrlSelect param="source" label={a.allSources} options={sources.map((s) => ({ value: s, label: sourceLabel(t, s) }))} /></>}
          empty={{ title: a.statementEmpty }}
        />
      </PeriodFrame>
    </>
  );
}
