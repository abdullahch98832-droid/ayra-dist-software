import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { can, requireActiveSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { WarehousesTable } from "./warehouses-table";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).warehouses.title };
}

export default async function WarehousesPage() {
  const ctx = await requireActiveSession();
  if (!can(ctx, "warehouses.view")) return <Forbidden />;
  const t = await getT();
  const supabase = await createClient();
  const [warehouses, balances, vehicles] = await Promise.all([
    supabase.from("warehouses").select("id, code, name_en, name_ur, warehouse_type, vehicle_id, address, is_active").order("code"),
    can(ctx, "inventory.view") ? supabase.from("stock_balances").select("warehouse_id").neq("on_hand", 0) : Promise.resolve({ data: null, error: null }),
    can(ctx, "vehicles.view") ? supabase.from("vehicles").select("id, registration_no, name").eq("is_active", true).order("registration_no") : Promise.resolve({ data: [], error: null }),
  ]);
  for (const r of [warehouses, balances, vehicles]) if (r.error) throw r.error;
  const count = new Map<string, number>();
  for (const b of balances.data ?? []) count.set(b.warehouse_id, (count.get(b.warehouse_id) ?? 0) + 1);
  return (
    <>
      <PageHeader title={t.warehouses.title} description={t.warehouses.subtitle} />
      <WarehousesTable
        rows={(warehouses.data ?? []).map((w) => ({
          id: w.id, code: w.code, nameEn: w.name_en, nameUr: w.name_ur ?? "", type: w.warehouse_type, vehicleId: w.vehicle_id ?? "",
          address: w.address ?? "", isActive: w.is_active, products: balances.data ? count.get(w.id) ?? 0 : null,
        }))}
        vehicles={(vehicles.data ?? []).map((v) => ({ id: v.id, label: `${v.registration_no} — ${v.name}` }))}
        canManage={can(ctx, "warehouses.manage")}
      />
    </>
  );
}
