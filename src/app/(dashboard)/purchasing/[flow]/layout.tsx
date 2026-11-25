import { notFound } from "next/navigation";
import { accountView, flowPath, FLOW_ACCESS, isFlow } from "@/features/purchasing/flow";
import { getT } from "@/i18n/server";
import { can, requireActiveSession } from "@/lib/auth/session";
import { Forbidden } from "@/components/layout/forbidden";
import { SubNav } from "@/components/layout/sub-nav";

export default async function PurchasingLayout({ params, children }: LayoutProps<"/purchasing/[flow]">) {
  const { flow } = await params;
  if (!isFlow(flow)) notFound();
  const ctx = await requireActiveSession();
  if (!FLOW_ACCESS[flow].some((p) => can(ctx, p))) return <Forbidden />;
  const t = await getT();
  const tabs = t.purchasing.tabs;
  const account = can(ctx, accountView(flow));
  const documents = can(ctx, "purchasing.view") || can(ctx, "purchasing.create");
  return (
    <>
      <SubNav
        label={t.purchasing.flows[flow]}
        items={[
          { href: flowPath(flow), label: tabs.overview, exact: true },
          ...(documents ? [
            { href: flowPath(flow, "orders"), label: tabs.orders },
            { href: flowPath(flow, "receipts"), label: tabs.receipts },
            { href: flowPath(flow, "bills"), label: tabs.bills },
            { href: flowPath(flow, "returns"), label: tabs.returns },
          ] : []),
          ...(account ? [
            { href: flowPath(flow, "payments"), label: tabs.payments },
            ...(flow === "company" ? [{ href: flowPath(flow, "extra-payments"), label: t.supply.extra.tab }] : []),
            { href: flowPath(flow, "account"), label: tabs.account },
          ] : []),
        ]}
      />
      {children}
    </>
  );
}
