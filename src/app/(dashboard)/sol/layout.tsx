import { getT } from "@/i18n/server";
import { can, requireActiveSession } from "@/lib/auth/session";
import { Forbidden } from "@/components/layout/forbidden";
import { SubNav } from "@/components/layout/sub-nav";

export default async function SolLayout({ children }: LayoutProps<"/sol">) {
  const ctx = await requireActiveSession();
  if (!can(ctx, "sol.view") && !can(ctx, "sol.manage")) return <Forbidden />;
  const { sol: s, distributor: o } = await getT();
  const money = can(ctx, "receivables.view") || can(ctx, "receivables.collect") || can(ctx, "receivables.post");
  return (
    <>
      <SubNav
        label={s.title}
        items={[
          ...(can(ctx, "sol.view") ? [{ href: "/sol", label: s.tabs.overview, exact: true }, { href: "/sol/orders", label: o.tab }, { href: "/sol/jobs", label: s.tabs.jobs }, { href: "/sol/deliveries", label: s.tabs.deliveries }] : []),
          ...(money ? [{ href: "/sol/payments", label: s.tabs.payments }] : []),
          ...(can(ctx, "sol.manage") ? [{ href: "/sol/setup", label: s.tabs.setup }] : []),
        ]}
      />
      {children}
    </>
  );
}
