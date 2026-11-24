import type { Metadata } from "next";
import { Banknote } from "lucide-react";
import { accountPay, flowPath } from "@/features/purchasing/flow";
import { purchasingPage } from "@/features/purchasing/page-context";
import { loadFlowSuppliers, loadPayments, seesAccount } from "@/features/purchasing/queries";
import { can } from "@/lib/auth/session";
import { sumPaisa, toDbAmount, toPaisa } from "@/lib/utils/money";
import { Forbidden } from "@/components/layout/forbidden";
import { LIST_PAGE, listParams } from "@/lib/list-params";
import { ListFilters } from "@/components/documents/list-filters";
import { PageHeader } from "@/components/layout/page-header";
import { LinkButton } from "@/components/shared/link-button";
import { SpecTable } from "@/components/tables/spec-table";
import { UrlSelect } from "@/components/tables/url-filters";

const STATUSES = ["posted", "void"] as const;

export async function generateMetadata({ params }: PageProps<"/purchasing/[flow]/payments">): Promise<Metadata> {
  return { title: (await purchasingPage(params)).t.purchasing.tabs.payments };
}

export default async function PaymentsPage({ params, searchParams }: PageProps<"/purchasing/[flow]/payments">) {
  const { flow, ctx, t, local } = await purchasingPage(params);
  if (!seesAccount(ctx, flow)) return <Forbidden />;
  const p = t.purchasing;
  const filter = listParams(await searchParams, STATUSES);
  const [{ rows: payments, total }, suppliers] = await Promise.all([loadPayments(flow, filter), flow === "suppliers" ? loadFlowSuppliers(flow, true) : []]);
  const add = can(ctx, accountPay(flow)) && <LinkButton href={flowPath(flow, "payments", "new")}><Banknote aria-hidden />{p.newPayment}</LinkButton>;
  return (
    <>
      <PageHeader title={p.tabs.payments} description={p.flows[flow]} actions={add} />
      <SpecTable
        caption={p.tabs.payments}
        rows={payments.map((x) => {
          const settled = sumPaisa(x.supplier_payment_allocations.map((a) => toPaisa(a.amount)));
          return {
            id: x.id, no: x.doc_no, noHref: flowPath(flow, "payments", x.id), date: x.payment_date, supplier: local(x.supplier.name, x.supplier.name_ur), method: p.methods[x.method], reference: x.reference,
            amount: x.amount, onAccount: x.status === "posted" ? toDbAmount(toPaisa(x.amount) - settled) : null, status: x.status,
          };
        })}
        columns={[
          { key: "no", label: t.documents.number, kind: "link", primary: true },
          ...(flow === "suppliers" ? [{ key: "supplier", label: t.documents.supplier, kind: "text" as const }] : []),
          { key: "date", label: t.documents.date, kind: "date" },
          { key: "method", label: p.method, kind: "text", hideBelow: "lg" },
          { key: "reference", label: t.documents.reference, kind: "code", hideBelow: "xl" },
          { key: "amount", label: p.paymentAmount, kind: "money" },
          { key: "onAccount", label: p.onAccount, kind: "money", hideBelow: "lg" },
          { key: "status", label: t.common.status, kind: "status", options: { draft: { label: p.statuses.draft, tone: "gray" }, posted: { label: p.statuses.posted, tone: "green" }, void: { label: p.statuses.void, tone: "red" } } },
        ]}
        server={{ page: filter.page, pageSize: LIST_PAGE, total }}
        toolbar={<ListFilters t={t} local={local} suppliers={suppliers}><UrlSelect param="status" label={t.documents.allStatuses} options={STATUSES.map((s) => ({ value: s, label: p.statuses[s] }))} /></ListFilters>}
        empty={{ title: t.documents.empty, description: t.documents.emptyHint, action: add }}
      />
    </>
  );
}
