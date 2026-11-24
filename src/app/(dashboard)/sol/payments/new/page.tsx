import type { Metadata } from "next";
import { accountLabel, loadPaymentAccounts } from "@/features/cash-bank/queries";
import { businessToday } from "@/features/dashboard/period";
import { reportSolJobs } from "@/features/sol/queries";
import { isOpenJob } from "@/features/sol/status";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext, uuidParam } from "@/lib/page-context";
import { createClient } from "@/lib/supabase/server";
import { toDbAmount, toPaisa } from "@/lib/utils/money";
import { FormAlert } from "@/components/forms/field";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { SolPaymentForm } from "./payment-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).sol.newPayment };
}

export default async function NewSolPaymentPage({ searchParams }: PageProps<"/sol/payments/new">) {
  const { ctx, t, local } = await pageContext();
  const poster = can(ctx, "receivables.post");
  if (!can(ctx, "sol.view") || (!poster && !can(ctx, "receivables.collect"))) return <Forbidden />;
  const wanted = uuidParam((await searchParams).job);
  const supabase = await createClient();
  const [jobs, accounts, waiting] = await Promise.all([reportSolJobs({}), loadPaymentAccounts(), supabase.from("customer_payments").select("sol_job_id, amount").eq("status", "draft").not("sol_job_id", "is", null)]);
  if (waiting.error) throw waiting.error;
  // Payments waiting to be posted already take part of the balance.
  const reserved = new Map<string, bigint>();
  for (const w of waiting.data) reserved.set(w.sol_job_id ?? "", (reserved.get(w.sol_job_id ?? "") ?? BigInt(0)) + toPaisa(w.amount));
  const payable = jobs.filter((j) => isOpenJob(j.status) || j.status === "completed")
    .map((j) => ({ id: j.job_id, number: j.doc_no, client: local(j.customer, j.customer_ur), left: toPaisa(j.pending ?? 0) - (reserved.get(j.job_id) ?? BigInt(0)) }))
    .filter((j) => j.left > BigInt(0)).map(({ left, ...j }) => ({ ...j, balance: toDbAmount(left) }));
  const active = accounts.filter((a) => a.isActive);
  const cash = active.filter((a) => a.type === "cash");
  return (
    <>
      <PageHeader title={t.sol.newPayment} breadcrumbs={[{ label: t.sol.tabs.payments, href: "/sol/payments" }]} />
      {active.length === 0 ? <FormAlert tone="info">{t.cashBank.noAccounts}</FormAlert> : (
        <SolPaymentForm
          jobs={payable} accounts={active.map((a) => ({ id: a.id, label: accountLabel(a) }))} poster={poster}
          defaults={{
            jobId: payable.some((j) => j.id === wanted) ? wanted ?? "" : "", date: businessToday(), amount: "", method: "cash", accountId: cash.length === 1 ? cash[0]?.id ?? "" : "", payerAccount: "", reference: "", notes: "",
            requestId: crypto.randomUUID(),
          }}
        />
      )}
    </>
  );
}
