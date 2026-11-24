import type { Metadata } from "next";
import { loadOverrideOn } from "@/features/inventory/queries";
import { getT } from "@/i18n/server";
import { can, requireActiveSession } from "@/lib/auth/session";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { NegativeStockSetting } from "./negative-stock-setting";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).settings.title };
}

export default async function SettingsPage() {
  const ctx = await requireActiveSession();
  if (!can(ctx, "settings.manage")) return <Forbidden />;
  const t = await getT();
  const enabled = await loadOverrideOn();
  return (
    <>
      <PageHeader title={t.settings.title} description={t.settings.subtitle} />
      <SectionCard title={t.settings.inventory} className="max-w-3xl"><NegativeStockSetting enabled={enabled} /></SectionCard>
    </>
  );
}
