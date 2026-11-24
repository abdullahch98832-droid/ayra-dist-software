import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadCustomer } from "@/features/customers/queries";
import { loadTakers } from "@/features/takers/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { toDbAmount, toPaisa } from "@/lib/utils/money";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { CustomerForm } from "../../customer-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).customers.edit };
}

export default async function EditCustomerPage({ params }: PageProps<"/customers/[id]/edit">) {
  const { id, ctx, t } = await pageContext(params);
  if (!can(ctx, "customers.manage")) return <Forbidden />;
  const [c, takers] = await Promise.all([loadCustomer(id), loadTakers()]);
  if (!c) notFound();
  return (
    <>
      <PageHeader title={t.customers.edit} breadcrumbs={[{ label: t.customers.title, href: "/customers" }, { label: c.name, href: `/customers/${id}` }]} />
      <CustomerForm
        customerId={id} takers={takers.filter((x) => x.isActive || x.id === c.order_taker_id)} opening={false}
        defaults={{
          code: c.code, name: c.name, nameUr: c.name_ur ?? "", ownerName: c.owner_name ?? "", phone: c.phone ?? "", altPhone: c.alt_phone ?? "", whatsapp: c.whatsapp ?? "",
          address: c.address ?? "", area: c.area ?? "", city: c.city ?? "", ntn: c.ntn ?? "", creditLimit: c.credit_limit === null ? "" : toDbAmount(toPaisa(c.credit_limit)),
          paymentTerms: c.payment_terms_days === null ? "" : String(c.payment_terms_days), orderTakerId: c.order_taker_id ?? "", isActive: c.is_active, notes: c.notes ?? "",
          openingBalance: "", openingDate: "",
        }}
      />
    </>
  );
}
