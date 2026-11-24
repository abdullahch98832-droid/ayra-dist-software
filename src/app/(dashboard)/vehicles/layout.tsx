import { getT } from "@/i18n/server";
import { can, requireActiveSession } from "@/lib/auth/session";
import { Forbidden } from "@/components/layout/forbidden";
import { SubNav } from "@/components/layout/sub-nav";

export default async function VehiclesLayout({ children }: LayoutProps<"/vehicles">) {
  const ctx = await requireActiveSession();
  if (!can(ctx, "vehicles.view")) return <Forbidden />;
  const { vehicles: v } = await getT();
  return (
    <>
      <SubNav label={v.title} items={[{ href: "/vehicles", label: v.tabs.list, exact: true }, { href: "/vehicles/trips", label: v.tabs.trips }, { href: "/vehicles/drivers", label: v.tabs.drivers }]} />
      {children}
    </>
  );
}
