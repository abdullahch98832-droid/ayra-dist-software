import { getT } from "@/i18n/server";
import { can, requireActiveSession } from "@/lib/auth/session";
import { Forbidden } from "@/components/layout/forbidden";
import { SubNav } from "@/components/layout/sub-nav";

export default async function InventoryLayout({ children }: LayoutProps<"/inventory">) {
  const ctx = await requireActiveSession();
  const stock = can(ctx, "inventory.view");
  const orders = can(ctx, "sales.view") || can(ctx, "sales.view_all");
  const dispatch = orders && can(ctx, "sales.dispatch");
  if (!stock && !dispatch) return <Forbidden />;
  const t = await getT();
  const tabs = t.stock.tabs;
  return (
    <>
      <SubNav
        label={t.stock.title}
        items={[
          ...(stock ? [
            { href: "/inventory", label: tabs.stock, exact: true },
            { href: "/inventory/movements", label: tabs.movements },
            { href: "/inventory/transfers", label: tabs.transfers },
            { href: "/inventory/counts", label: tabs.counts },
            { href: "/inventory/adjustments", label: tabs.adjustments },
            { href: "/inventory/damaged", label: tabs.damaged },
            ...(orders ? [{ href: "/inventory/reservations", label: tabs.reservations }] : []),
          ] : []),
          ...(dispatch ? [{ href: "/inventory/dispatch", label: tabs.dispatch }] : []),
        ]}
      />
      {children}
    </>
  );
}
