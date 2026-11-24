import { seesLedgers, seesStatements } from "@/features/accounting/queries";
import { getT } from "@/i18n/server";
import { can, requireActiveSession } from "@/lib/auth/session";
import { Forbidden } from "@/components/layout/forbidden";
import { SubNav } from "@/components/layout/sub-nav";

export default async function AccountingLayout({ children }: LayoutProps<"/accounting">) {
  const ctx = await requireActiveSession();
  const ledgers = seesLedgers(ctx);
  const statements = seesStatements(ctx);
  const close = can(ctx, "accounting.close");
  if (!ledgers && !statements && !close) return <Forbidden />;
  const { accounting: a } = await getT();
  return (
    <>
      <SubNav
        label={a.title}
        items={[
          { href: "/accounting", label: a.tabs.overview, exact: true },
          ...(ledgers ? [{ href: "/accounting/accounts", label: a.tabs.accounts }, { href: "/accounting/ledger", label: a.tabs.ledger }, { href: "/accounting/journal", label: a.tabs.journal }] : []),
          ...(statements ? [{ href: "/accounting/trial-balance", label: a.tabs.trial }, { href: "/accounting/profit-and-loss", label: a.tabs.profit }, { href: "/accounting/balance-sheet", label: a.tabs.balance }, { href: "/accounting/cash-flow", label: a.tabs.cash }] : []),
          { href: "/accounting/periods", label: a.tabs.periods },
          ...(ledgers || statements ? [{ href: "/accounting/checks", label: a.tabs.checks }] : []),
        ]}
      />
      {children}
    </>
  );
}
