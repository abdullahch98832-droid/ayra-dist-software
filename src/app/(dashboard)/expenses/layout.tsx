import { getT } from "@/i18n/server";
import { can, requireActiveSession } from "@/lib/auth/session";
import { Forbidden } from "@/components/layout/forbidden";
import { SubNav } from "@/components/layout/sub-nav";

export default async function ExpensesLayout({ children }: LayoutProps<"/expenses">) {
  const ctx = await requireActiveSession();
  if (!can(ctx, "expenses.view") && !can(ctx, "expenses.create") && !can(ctx, "expenses.post")) return <Forbidden />;
  const { expenses: x } = await getT();
  return (
    <>
      {can(ctx, "expenses.post") && <SubNav label={x.title} items={[{ href: "/expenses", label: x.tabs.vouchers, exact: true }, { href: "/expenses/categories", label: x.tabs.categories }]} />}
      {children}
    </>
  );
}
