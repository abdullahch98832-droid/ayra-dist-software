import type { Metadata } from "next";
import { Banknote } from "lucide-react";
import { peopleNames } from "@/features/payments/contributors";
import { seesSettlements } from "@/features/sales/access";
import { documentOptions } from "@/features/sales/status";
import { isAdvance, loadSolPayments, settledFor } from "@/features/sol/queries";
import { SOL_METHODS } from "@/features/sol/schema";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { LIST_PAGE, listParams } from "@/lib/list-params";
import { pageContext } from "@/lib/page-context";
import { toDbAmount } from "@/lib/utils/money";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { LinkButton } from "@/components/shared/link-button";
import { SpecTable } from "@/components/tables/spec-table";
import { UrlSearch, UrlSelect } from "@/components/tables/url-filters";

const STATUSES = ["draft", "posted", "void"] as const;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).sol.tabs.payments };
}

export default async function SolPaymentsPage({ searchParams }: PageProps<"/sol/payments">) {
  const { ctx, t, local } = await pageContext();
  if (!seesSettlements(ctx)) return <Forbidden />;
  const s = t.sol;
  const query = await searchParams;
  const method = SOL_METHODS.find((m) => m === query.method) ?? "";
  const filter = { ...listParams(query, STATUSES), method };
  const { rows, total } = await loadSolPayments(filter);
  const add = (can(ctx, "receivables.collect") || can(ctx, "receivables.post")) && can(ctx, "sol.view") && <LinkButton href="/sol/payments/new"><Banknote aria-hidden />{s.newPayment}</LinkButton>;
  return (
    <>
      <PageHeader title={s.tabs.payments} actions={add} />
      <SpecTable
        caption={s.tabs.payments}
        rows={rows.map((p) => ({
          id: p.id, no: p.doc_no, noHref: `/receivables/payments/${p.id}`, reference: p.reference, date: p.payment_date, job: p.job?.doc_no, jobHref: p.job ? `/sol/jobs/${p.job.id}` : undefined,
          client: p.customer ? local(p.customer.name, p.customer.name_ur) : null, method: t.purchasing.methods[p.method], identifier: p.payer_account, account: peopleNames(p.contributors) ?? p.account?.name, amount: p.amount,
          settled: p.status === "posted" && p.sol_job_id ? toDbAmount(settledFor(p, p.sol_job_id)) : null, status: p.status,
          kind: isAdvance(p, p.job) ? s.advance : s.partial,
        }))}
        columns={[
          { key: "no", sub: "reference", label: t.documents.number, kind: "link", primary: true }, { key: "date", sub: "kind", label: t.documents.date, kind: "date" }, { key: "job", label: s.job, kind: "link" },
          { key: "client", label: s.client, kind: "text", hideBelow: "lg" }, { key: "method", sub: "identifier", label: s.method, kind: "text", hideBelow: "lg" }, { key: "account", label: s.account, kind: "text", hideBelow: "xl" },
          { key: "amount", label: s.amount, kind: "money" }, { key: "settled", label: s.received, kind: "money", hideBelow: "2xl" }, { key: "status", label: t.common.status, kind: "status", options: documentOptions(t) },
        ]}
        server={{ page: filter.page, pageSize: LIST_PAGE, total }}
        toolbar={
          <>
            <UrlSearch placeholder={t.documents.searchNumber} />
            <UrlSelect param="status" label={t.documents.allStatuses} options={STATUSES.map((x) => ({ value: x, label: t.purchasing.statuses[x] }))} />
            <UrlSelect param="method" label={t.receivables.allMethods} options={SOL_METHODS.map((m) => ({ value: m, label: t.purchasing.methods[m] }))} />
          </>
        }
        empty={{ title: s.paymentEmpty, action: add }}
      />
    </>
  );
}
