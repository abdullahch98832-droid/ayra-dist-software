import { getT } from "@/i18n/server";
import { can, requireActiveSession } from "@/lib/auth/session";
import { Forbidden } from "@/components/layout/forbidden";
import { SubNav } from "@/components/layout/sub-nav";

export default async function SalesLayout({ children }: LayoutProps<"/sales">) {
  const ctx = await requireActiveSession();
  if (!can(ctx, "sales.view") && !can(ctx, "sales.view_all")) return <Forbidden />;
  const t = await getT();
  const tabs = t.sales.tabs;
  return (
    <>
      <SubNav
        label={t.sales.title}
        items={[
          { href: "/sales", label: tabs.overview, exact: true },
          { href: "/sales/orders", label: tabs.orders },
          { href: "/sales/deliveries", label: tabs.deliveries },
          { href: "/sales/invoices", label: tabs.invoices },
          ...(can(ctx, "sales.view_all") || can(ctx, "sales.return") ? [{ href: "/sales/returns", label: tabs.returns }] : []),
        ]}
      />
      {children}
    </>
  );
}
