import { getT } from "@/i18n/server";
import { can, requireActiveSession } from "@/lib/auth/session";
import { Forbidden } from "@/components/layout/forbidden";
import { SubNav } from "@/components/layout/sub-nav";

export default async function ReceivablesLayout({ children }: LayoutProps<"/receivables">) {
  const ctx = await requireActiveSession();
  const view = can(ctx, "receivables.view");
  const collect = can(ctx, "receivables.collect") || can(ctx, "receivables.post");
  const adjust = can(ctx, "receivables.adjust");
  if (!view && !collect && !adjust) return <Forbidden />;
  const t = await getT();
  const tabs = t.receivables.tabs;
  return (
    <>
      <SubNav
        label={t.receivables.title}
        items={[
          ...(view ? [{ href: "/receivables", label: tabs.overview, exact: true }] : []),
          ...(view || collect ? [{ href: "/receivables/payments", label: tabs.payments }, { href: "/receivables/cash", label: tabs.cash }] : []),
          ...(view || adjust ? [{ href: "/receivables/notes", label: tabs.notes }] : []),
        ]}
      />
      {children}
    </>
  );
}
