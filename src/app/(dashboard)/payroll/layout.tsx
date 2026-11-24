import { getT } from "@/i18n/server";
import { can, requireActiveSession } from "@/lib/auth/session";
import { Forbidden } from "@/components/layout/forbidden";
import { SubNav } from "@/components/layout/sub-nav";

export default async function PayrollLayout({ children }: LayoutProps<"/payroll">) {
  const ctx = await requireActiveSession();
  if (!can(ctx, "payroll.view")) return <Forbidden />;
  const { payroll: p } = await getT();
  return (
    <>
      <SubNav label={p.title} items={[{ href: "/payroll", label: p.tabs.runs, exact: true }, { href: "/payroll/employees", label: p.tabs.employees }, { href: "/payroll/advances", label: p.tabs.advances }]} />
      {children}
    </>
  );
}
