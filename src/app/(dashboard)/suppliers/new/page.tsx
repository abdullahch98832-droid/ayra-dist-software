import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { can, requireActiveSession } from "@/lib/auth/session";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { SupplierForm } from "../supplier-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).suppliers.add };
}

export default async function NewSupplierPage() {
  const ctx = await requireActiveSession();
  if (!can(ctx, "suppliers.manage")) return <Forbidden />;
  const t = await getT();
  return (
    <>
      <PageHeader title={t.suppliers.add} breadcrumbs={[{ label: t.suppliers.title, href: "/suppliers" }]} />
      <SupplierForm supplierId={null} defaults={{ code: "", name: "", nameUr: "", phone: "", email: "", address: "", ntn: "", terms: "", isActive: true, notes: "", contacts: [] }} />
    </>
  );
}
