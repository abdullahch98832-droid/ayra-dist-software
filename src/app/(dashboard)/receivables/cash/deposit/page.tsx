import type { Metadata } from "next";
import { businessToday } from "@/features/dashboard/period";
import { loadCash, loadReceivingAccounts } from "@/features/receivables/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext, uuidParam } from "@/lib/page-context";
import { toDbAmount, toPaisa } from "@/lib/utils/money";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { DepositForm } from "./deposit-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).receivables.newDeposit };
}

export default async function DepositPage({ searchParams }: PageProps<"/receivables/cash/deposit">) {
  const { ctx, t } = await pageContext();
  const poster = can(ctx, "receivables.post");
  if (!poster && !can(ctx, "receivables.collect")) return <Forbidden />;
  const [cash, accounts] = await Promise.all([loadCash(), loadReceivingAccounts()]);
  const holders = cash.filter((c) => poster || c.employee_id === ctx.employeeId).map((c) => ({ id: c.employee_id, nameEn: c.full_name, nameUr: c.full_name_ur, held: toDbAmount(toPaisa(c.held)) }));
  if (holders.length === 0) return <Forbidden />;
  const requested = uuidParam((await searchParams).taker);
  const holder = holders.find((h) => h.id === requested) ?? (holders.length === 1 ? holders[0] : undefined);
  return (
    <>
      <PageHeader title={t.receivables.newDeposit} breadcrumbs={[{ label: t.receivables.tabs.cash, href: "/receivables/cash" }]} />
      <DepositForm
        holders={holders} accounts={accounts} poster={poster}
        defaults={{ employeeId: holder?.id ?? "", date: businessToday(), amount: holder && toPaisa(holder.held) > BigInt(0) ? holder.held : "", accountId: accounts.length === 1 ? accounts[0]?.id ?? "" : "", reference: "", notes: "", requestId: crypto.randomUUID(), contributors: [] }}
      />
    </>
  );
}
