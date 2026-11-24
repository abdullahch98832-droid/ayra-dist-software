import type { Metadata } from "next";
import { loadChecks, seesLedgers, seesStatements } from "@/features/accounting/queries";
import { fill } from "@/i18n/format";
import { getT } from "@/i18n/server";
import { pageContext } from "@/lib/page-context";
import { toDbAmount, toPaisa } from "@/lib/utils/money";
import { FormAlert } from "@/components/forms/field";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { formatNumber } from "@/components/shared/format";
import { SpecTable } from "@/components/tables/spec-table";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).accounting.checks };
}

export default async function ChecksPage() {
  const { ctx, t, locale } = await pageContext();
  if (!seesLedgers(ctx) && !seesStatements(ctx)) return <Forbidden />;
  const a = t.accounting;
  const rows = (await loadChecks()).map((c) => ({ ...c, difference: toPaisa(c.ledger) - toPaisa(c.documents) }));
  const failed = rows.filter((c) => c.difference !== BigInt(0)).length;
  return (
    <>
      <PageHeader title={a.checks} description={a.checksHint} />
      <div className="grid gap-4">
        <FormAlert tone={failed ? "error" : "success"}>{failed ? fill(a.someDiffer, { count: formatNumber(failed, locale) }) : a.allAgree}</FormAlert>
        <SpecTable
          caption={a.checks}
          rows={rows.map((c) => ({ id: c.check_code, name: (a.checkNames as Record<string, string>)[c.check_code] ?? c.check_code, ledger: c.ledger, documents: c.documents, difference: toDbAmount(c.difference), status: c.difference === BigInt(0) ? "ok" : "no" }))}
          columns={[{ key: "name", label: a.check, kind: "text", primary: true }, { key: "ledger", label: a.ledgerAmount, kind: "money" }, { key: "documents", label: a.documentAmount, kind: "money" }, { key: "difference", label: a.difference, kind: "money" }, { key: "status", label: t.common.status, kind: "status", options: { ok: { label: a.agrees, tone: "green" }, no: { label: a.differs, tone: "red" } } }]}
          pageSize={50}
          empty={{ title: a.checks }}
        />
      </div>
    </>
  );
}
