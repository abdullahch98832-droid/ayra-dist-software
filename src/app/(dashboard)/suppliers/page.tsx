import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OTHER_VENDORS } from "@/config/vendors";
import { Plus } from "lucide-react";
import { getT } from "@/i18n/server";
import { can, requireActiveSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { toDbAmount, toPaisa } from "@/lib/utils/money";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { LinkButton } from "@/components/shared/link-button";
import { SuppliersTable } from "./suppliers-table";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).suppliers.title };
}

export default async function SuppliersPage() {
  if (!OTHER_VENDORS) notFound();
  const ctx = await requireActiveSession();
  if (!can(ctx, "suppliers.view")) return <Forbidden />;
  const t = await getT();
  const supabase = await createClient();
  const company = can(ctx, "company.view");
  const payables = can(ctx, "payables.view");
  const [suppliers, balances] = await Promise.all([
    supabase.from("suppliers").select("id, code, name, name_ur, phone, is_principal, is_active").order("name").limit(1000),
    company || payables ? supabase.from("v_supplier_balances").select("supplier_id, balance") : Promise.resolve({ data: [], error: null }),
  ]);
  if (suppliers.error) throw suppliers.error;
  if (balances.error) throw balances.error;
  const balance = new Map((balances.data ?? []).map((b) => [b.supplier_id, b.balance]));
  const add = can(ctx, "suppliers.manage") && <LinkButton href="/suppliers/new"><Plus aria-hidden />{t.suppliers.add}</LinkButton>;
  return (
    <>
      <PageHeader title={t.suppliers.title} description={t.suppliers.subtitle} actions={add} />
      <SuppliersTable
        showBalance={company || payables}
        rows={suppliers.data.map((s) => {
          // Row level security hides ledger lines, so an unseen account must not read as zero.
          const visible = s.is_principal ? company : payables;
          return { id: s.id, code: s.code, name: s.name, nameUr: s.name_ur, phone: s.phone, isPrincipal: s.is_principal, isActive: s.is_active, balance: visible ? toDbAmount(toPaisa(balance.get(s.id) ?? 0)) : null };
        })}
        empty={{ title: t.suppliers.empty, action: add }}
      />
    </>
  );
}
