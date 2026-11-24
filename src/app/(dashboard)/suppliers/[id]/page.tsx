import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getLocale, getT } from "@/i18n/server";
import { can, requireActiveSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { Ltr } from "@/components/shared/bidi";
import { DescriptionList } from "@/components/shared/description-list";
import { LinkButton } from "@/components/shared/link-button";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { SupplierForm } from "../supplier-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).suppliers.edit };
}

export default async function SupplierPage({ params }: PageProps<"/suppliers/[id]">) {
  const ctx = await requireActiveSession();
  if (!can(ctx, "suppliers.view")) return <Forbidden />;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const supabase = await createClient();
  const [t, locale, supplier] = await Promise.all([
    getT(), getLocale(),
    supabase.from("suppliers").select("id, code, name, name_ur, phone, email, address, ntn, payment_terms_days, is_active, is_principal, notes, supplier_contacts(name, designation, phone, email, is_primary)").eq("id", id).maybeSingle(),
  ]);
  if (supplier.error) throw supplier.error;
  const s = supplier.data;
  if (!s) notFound();
  const canEdit = can(ctx, "suppliers.manage");
  const canSeeAccount = can(ctx, s.is_principal ? "company.view" : "payables.view");
  return (
    <>
      <PageHeader
        title={locale === "ur" && s.name_ur ? s.name_ur : s.name}
        breadcrumbs={[{ label: t.suppliers.title, href: "/suppliers" }]}
        description={<span className="flex flex-wrap items-center gap-3"><Ltr className="font-mono text-xs">{s.code}</Ltr>{s.is_principal && <StatusBadge tone="blue" dot={false}>{t.suppliers.mainCompany}</StatusBadge>}</span>}
        actions={canSeeAccount && <LinkButton variant="outline" href={s.is_principal ? "/purchasing/company/account" : `/purchasing/suppliers/account?supplier=${s.id}`}>{t.suppliers.statement}</LinkButton>}
      />
      {canEdit ? (
        <SupplierForm
          supplierId={id}
          defaults={{
            code: s.code, name: s.name, nameUr: s.name_ur ?? "", phone: s.phone ?? "", email: s.email ?? "", address: s.address ?? "", ntn: s.ntn ?? "",
            terms: s.payment_terms_days === null ? "" : String(s.payment_terms_days), isActive: s.is_active, notes: s.notes ?? "",
            contacts: s.supplier_contacts.map((c) => ({ name: c.name, designation: c.designation ?? "", phone: c.phone ?? "", email: c.email ?? "", isPrimary: c.is_primary })),
          }}
        />
      ) : (
        <div className="grid max-w-4xl gap-6">
          <SectionCard title={t.suppliers.details}>
            <DescriptionList items={[
              { label: t.suppliers.phone, value: s.phone && <Ltr>{s.phone}</Ltr> }, { label: t.suppliers.email, value: s.email && <Ltr>{s.email}</Ltr> },
              { label: t.suppliers.address, value: s.address }, { label: t.suppliers.ntn, value: s.ntn && <Ltr>{s.ntn}</Ltr> },
              { label: t.suppliers.terms, value: s.payment_terms_days },
            ]} />
          </SectionCard>
          {s.supplier_contacts.length > 0 && (
            <SectionCard title={t.suppliers.contacts}>
              <DescriptionList items={s.supplier_contacts.map((c) => ({ label: [c.name, c.designation].filter(Boolean).join(" · "), value: c.phone && <Ltr>{c.phone}</Ltr> }))} />
            </SectionCard>
          )}
        </div>
      )}
    </>
  );
}
