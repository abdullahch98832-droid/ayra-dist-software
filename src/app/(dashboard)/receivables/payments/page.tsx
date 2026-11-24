import type { Metadata } from "next";
import { Banknote } from "lucide-react";
import { loadPayments, seesAllCollections } from "@/features/receivables/queries";
import { PAYMENT_METHODS } from "@/features/receivables/schema";
import { documentOptions } from "@/features/sales/status";
import { loadTakers, takerNames } from "@/features/takers/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { LIST_PAGE, listParams } from "@/lib/list-params";
import { pageContext, uuidParam } from "@/lib/page-context";
import { sumPaisa, toDbAmount, toPaisa } from "@/lib/utils/money";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { LinkButton } from "@/components/shared/link-button";
import { SpecTable } from "@/components/tables/spec-table";
import { UrlSearch, UrlSelect } from "@/components/tables/url-filters";

const STATUSES = ["draft", "posted", "void"] as const;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).receivables.tabs.payments };
}

export default async function PaymentsPage({ searchParams }: PageProps<"/receivables/payments">) {
  const { ctx, t, local } = await pageContext();
  if (!can(ctx, "receivables.view") && !can(ctx, "receivables.collect") && !can(ctx, "receivables.post")) return <Forbidden />;
  const r = t.receivables;
  const query = await searchParams;
  const method = PAYMENT_METHODS.find((m) => m === query.method) ?? "";
  const filter = { ...listParams(query, STATUSES), customerId: uuidParam(query.customer), takerId: uuidParam(query.taker), method };
  const all = seesAllCollections(ctx);
  const [{ rows, total }, takers, names] = await Promise.all([loadPayments(filter), all ? loadTakers() : [], takerNames()]);
  const add = can(ctx, "receivables.collect") && <LinkButton href="/receivables/payments/new"><Banknote aria-hidden />{r.newPayment}</LinkButton>;
  return (
    <>
      <PageHeader title={r.tabs.payments} actions={add} />
      <SpecTable
        caption={r.tabs.payments}
        rows={rows.map((p) => {
          const collector = names.get(p.collected_by ?? "");
          const settled = sumPaisa(p.customer_payment_allocations.map((a) => toPaisa(a.amount)));
          return {
            id: p.id, no: p.doc_no, noHref: `/receivables/payments/${p.id}`, customer: p.customer ? local(p.customer.name, p.customer.name_ur) : null, date: p.payment_date, method: t.purchasing.methods[p.method], reference: p.reference,
            collector: collector ? local(collector.nameEn, collector.nameUr) : null, held: p.financial_account_id ? null : r.heldByTaker, amount: p.amount, onAccount: p.status === "posted" ? toDbAmount(toPaisa(p.amount) - settled) : null, status: p.status,
          };
        })}
        columns={[
          { key: "no", sub: "reference", label: t.documents.number, kind: "link", primary: true },
          { key: "customer", label: t.sales.customer, kind: "text" },
          { key: "date", label: t.documents.date, kind: "date" },
          { key: "method", sub: "held", label: r.method, kind: "text", hideBelow: "lg" },
          { key: "collector", label: r.collectedBy, kind: "text", hideBelow: "xl" },
          { key: "amount", label: r.amount, kind: "money" },
          { key: "onAccount", label: r.onAccount, kind: "money", hideBelow: "xl" },
          { key: "status", label: t.common.status, kind: "status", options: documentOptions(t) },
        ]}
        server={{ page: filter.page, pageSize: LIST_PAGE, total }}
        toolbar={
          <>
            <UrlSearch placeholder={t.documents.searchNumber} />
            <UrlSelect param="status" label={t.documents.allStatuses} options={STATUSES.map((x) => ({ value: x, label: t.purchasing.statuses[x] }))} />
            <UrlSelect param="method" label={r.allMethods} options={PAYMENT_METHODS.map((m) => ({ value: m, label: t.purchasing.methods[m] }))} />
            {takers.length > 0 && <UrlSelect param="taker" label={t.customers.allOrderTakers} options={takers.map((x) => ({ value: x.id, label: local(x.nameEn, x.nameUr) }))} />}
          </>
        }
        empty={{ title: r.paymentEmpty, description: t.documents.emptyHint, action: add }}
      />
    </>
  );
}
