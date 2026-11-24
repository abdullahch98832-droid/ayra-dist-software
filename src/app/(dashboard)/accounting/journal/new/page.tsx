import type { Metadata } from "next";
import { loadChart, loadParties } from "@/features/accounting/queries";
import { businessToday } from "@/features/dashboard/period";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { JournalForm } from "./journal-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).accounting.newJournal };
}

// Changed by their documents only; the database refuses them too.
const DOCUMENT_ACCOUNTS = ["SALES", "SALES_RETURNS", "SOL_REVENUE", "INVENTORY", "COGS", "CASH_WITH_COLLECTORS", "SALARIES_PAYABLE", "EMPLOYEE_ADVANCES"];

export default async function NewJournalPage() {
  const { ctx, t } = await pageContext();
  if (!can(ctx, "accounting.journal") || !can(ctx, "accounting.view")) return <Forbidden />;
  const [chart, parties] = await Promise.all([loadChart(), loadParties()]);
  const party = (key: string | null) => (key === "AR" ? "customer" : key === "AP_PRINCIPAL" || key === "AP_SUPPLIERS" ? "supplier" : null);
  return (
    <>
      <PageHeader title={t.accounting.newJournal} description={t.accounting.journalHint} breadcrumbs={[{ label: t.accounting.tabs.journal, href: "/accounting/journal" }]} />
      <JournalForm
        accounts={chart.filter((x) => x.is_postable && x.is_active && !DOCUMENT_ACCOUNTS.includes(x.system_key ?? "")).map((x) => ({ id: x.id, code: x.code, nameEn: x.name_en, nameUr: x.name_ur, party: party(x.system_key) }))}
        customers={parties.customers} suppliers={parties.suppliers}
        defaults={{ date: businessToday(), description: "", requestId: crypto.randomUUID(), lines: [0, 1].map(() => ({ accountId: "", customerId: "", supplierId: "", debit: "", credit: "" })) }}
      />
    </>
  );
}
