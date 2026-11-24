import type { Metadata } from "next";
import { accountLabel, loadPaymentAccounts } from "@/features/cash-bank/queries";
import { businessToday } from "@/features/dashboard/period";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { TransferForm } from "./transfer-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).cashBank.newTransfer };
}

export default async function NewTransferPage() {
  const { ctx, t } = await pageContext();
  if (!can(ctx, "cash_bank.transfer") || !can(ctx, "cash_bank.view")) return <Forbidden />;
  const accounts = (await loadPaymentAccounts()).filter((a) => a.isActive);
  return (
    <>
      <PageHeader title={t.cashBank.newTransfer} breadcrumbs={[{ label: t.cashBank.tabs.transfers, href: "/cash-bank/transfers" }]} />
      <TransferForm accounts={accounts.map((a) => ({ id: a.id, label: accountLabel(a), type: a.type }))} defaults={{ fromId: "", toId: "", date: businessToday(), amount: "", method: "cash", reference: "", notes: "", requestId: crypto.randomUUID() }} />
    </>
  );
}
