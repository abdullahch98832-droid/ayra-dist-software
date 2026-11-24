import type { Metadata } from "next";
import { reportTrialBalance, seesStatements } from "@/features/accounting/queries";
import { businessToday, parsePeriod } from "@/features/dashboard/period";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { sumPaisa, toPaisa } from "@/lib/utils/money";
import { PeriodFrame } from "@/components/dashboard/period-frame";
import { FormAlert } from "@/components/forms/field";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { SpecTable } from "@/components/tables/spec-table";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).accounting.tabs.trial };
}

export default async function TrialBalancePage({ searchParams }: PageProps<"/accounting/trial-balance">) {
  const { ctx, t, local } = await pageContext();
  if (!seesStatements(ctx)) return <Forbidden />;
  const a = t.accounting;
  const today = businessToday();
  const period = parsePeriod(await searchParams, today);
  const rows = await reportTrialBalance(period.from, period.to);
  const sum = (key: "closing_debit" | "closing_credit") => sumPaisa(rows.map((r) => toPaisa(r[key])));
  const ok = sum("closing_debit") === sum("closing_credit");
  return (
    <>
      <PageHeader title={a.tabs.trial} />
      <PeriodFrame key={`${period.preset}-${period.from}-${period.to}`} period={period} today={today} title={a.tabs.trial} description={a.subtitle}>
        {rows.length > 0 && <FormAlert tone={ok ? "success" : "error"}>{ok ? a.balanced : a.differs}</FormAlert>}
        <SpecTable
          caption={a.tabs.trial}
          exportName={`trial-balance-${period.from}-${period.to}`}
          rows={rows.map((r) => ({
            id: r.account_id, code: r.code, name: local(r.name_en, r.name_ur), nameHref: can(ctx, "accounting.view") ? `/accounting/ledger?account=${r.account_id}&range=${period.preset}${period.preset === "custom" ? `&from=${period.from}&to=${period.to}` : ""}` : undefined, type: a.types[r.account_type],
            od: r.opening_debit, oc: r.opening_credit, debit: r.debit, credit: r.credit, cd: r.closing_debit, cc: r.closing_credit,
          }))}
          columns={[
            { key: "code", label: a.code, kind: "code" }, { key: "name", sub: "type", label: a.account, kind: "link", primary: true }, { key: "od", label: a.openingDebit, kind: "money", hideBelow: "2xl", total: true }, { key: "oc", label: a.openingCredit, kind: "money", hideBelow: "2xl", total: true },
            { key: "debit", label: a.debit, kind: "money", hideBelow: "lg", total: true }, { key: "credit", label: a.credit, kind: "money", hideBelow: "lg", total: true }, { key: "cd", label: a.closingDebit, kind: "money", total: true }, { key: "cc", label: a.closingCredit, kind: "money", total: true },
          ]}
          searchKeys={["code", "name", "type"]}
          pageSize={100}
          empty={{ title: a.statementEmpty }}
        />
      </PeriodFrame>
    </>
  );
}
