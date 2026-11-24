import { getT } from "@/i18n/server";
import { can, requireActiveSession } from "@/lib/auth/session";
import { Forbidden } from "@/components/layout/forbidden";
import { SubNav } from "@/components/layout/sub-nav";

export default async function CashBankLayout({ children }: LayoutProps<"/cash-bank">) {
  const ctx = await requireActiveSession();
  const view = can(ctx, "cash_bank.view");
  const books = view || can(ctx, "accounting.view");
  const close = view || can(ctx, "cash_bank.close");
  if (!books && !close) return <Forbidden />;
  const { cashBank: c } = await getT();
  return (
    <>
      <SubNav
        label={c.title}
        items={[
          ...(view ? [{ href: "/cash-bank", label: c.tabs.accounts, exact: true }] : []), ...(books ? [{ href: "/cash-bank/book", label: c.tabs.book }] : []), ...(view ? [{ href: "/cash-bank/transfers", label: c.tabs.transfers }] : []),
          ...(books ? [{ href: "/cash-bank/vouchers", label: c.tabs.vouchers }] : []), ...(close ? [{ href: "/cash-bank/closing", label: c.tabs.closing }] : []),
        ]}
      />
      {children}
    </>
  );
}
