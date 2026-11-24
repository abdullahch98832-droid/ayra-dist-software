import type { Metadata } from "next";
import { businessToday } from "@/features/dashboard/period";
import { loadTakers } from "@/features/takers/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { CustomerForm } from "../customer-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).customers.add };
}

export default async function NewCustomerPage() {
  const { ctx, t } = await pageContext();
  if (!can(ctx, "customers.manage")) return <Forbidden />;
  const takers = (await loadTakers()).filter((x) => x.isActive);
  return (
    <>
      <PageHeader title={t.customers.add} breadcrumbs={[{ label: t.customers.title, href: "/customers" }]} />
      <CustomerForm
        customerId={null} takers={takers} opening={can(ctx, "receivables.adjust")}
        defaults={{
          code: "", name: "", nameUr: "", ownerName: "", phone: "", altPhone: "", whatsapp: "", address: "", area: "", city: "", ntn: "", creditLimit: "", paymentTerms: "",
          orderTakerId: "", isActive: true, notes: "", openingBalance: "", openingDate: businessToday(),
        }}
      />
    </>
  );
}
