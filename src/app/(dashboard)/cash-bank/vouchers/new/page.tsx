import type { Metadata } from "next";
import { accountLabel, loadPaymentAccounts, loadVoucherAccounts } from "@/features/cash-bank/queries";
import { businessToday } from "@/features/dashboard/period";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { FormAlert } from "@/components/forms/field";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { VoucherForm } from "./voucher-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).cashBank.tabs.vouchers };
}

export default async function NewVoucherPage({ searchParams }: PageProps<"/cash-bank/vouchers/new">) {
  const { ctx, t } = await pageContext();
  if (!can(ctx, "accounting.journal") || !can(ctx, "cash_bank.view")) return <Forbidden />;
  const c = t.cashBank;
  const kind = (await searchParams).kind === "payment" ? "payment" : "receipt";
  const [accounts, counters] = await Promise.all([loadPaymentAccounts(), loadVoucherAccounts(kind)]);
  const active = accounts.filter((a) => a.isActive);
  return (
    <>
      <PageHeader title={kind === "payment" ? c.newPayment : c.newReceipt} breadcrumbs={[{ label: c.tabs.vouchers, href: "/cash-bank/vouchers" }]} />
      {active.length === 0 ? <FormAlert tone="info">{c.noAccounts}</FormAlert> : (
        <VoucherForm
          key={kind} accounts={active.map((a) => ({ id: a.id, label: accountLabel(a) }))} counters={counters.map((a) => ({ id: a.account_id, code: a.code, nameEn: a.name_en, nameUr: a.name_ur }))}
          defaults={{ kind, date: businessToday(), accountId: active.length === 1 ? active[0]?.id ?? "" : "", counterId: "", amount: "", party: "", method: "cash", reference: "", description: "", requestId: crypto.randomUUID() }}
        />
      )}
    </>
  );
}
