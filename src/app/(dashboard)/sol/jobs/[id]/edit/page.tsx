import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadProductOptions } from "@/features/catalog/product-options";
import { loadItemCosts, loadJob, loadJobTypes, loadServices, loadStaff } from "@/features/sol/queries";
import { isOpenJob } from "@/features/sol/status";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { createClient } from "@/lib/supabase/server";
import { toDbAmount, toPaisa } from "@/lib/utils/money";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { JobForm } from "../../job-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).sol.editJob };
}

export default async function EditJobPage({ params }: PageProps<"/sol/jobs/[id]/edit">) {
  const { id, ctx, t } = await pageContext(params);
  if (!can(ctx, "sol.manage")) return <Forbidden />;
  const job = await loadJob(id);
  if (!job || (job.status !== "draft" && !isOpenJob(job.status))) notFound();
  const supabase = await createClient();
  const [types, staff, services, products, costs, onDelivery] = await Promise.all([
    loadJobTypes(), loadStaff(), loadServices(), loadProductOptions(ctx, job.items.map((l) => l.product_id)), loadItemCosts(ctx, id),
    supabase.from("sol_delivery_items").select("sol_job_item_id").in("sol_job_item_id", job.items.map((l) => l.id)),
  ]);
  if (onDelivery.error) throw onDelivery.error;
  const c = job.customer;
  return (
    <>
      <PageHeader title={t.sol.editJob} breadcrumbs={[{ label: t.sol.tabs.jobs, href: "/sol/jobs" }, { label: job.doc_no, href: `/sol/jobs/${id}` }]} />
      <JobForm
        jobId={id} customer={c && { id: c.id, code: c.code, nameEn: c.name, nameUr: c.name_ur, city: c.city, orderTakerId: c.order_taker_id }} lockClient={job.status !== "draft"}
        types={types.filter((x) => x.isActive || x.id === job.job_type_id)} staff={staff.filter((x) => x.isActive || x.id === job.responsible_employee_id)} services={services} products={products}
        seesCosts={can(ctx, "costs.view")} canAddClient={can(ctx, "customers.manage")} delivered={[...new Set(onDelivery.data.map((x) => x.sol_job_item_id))]}
        defaults={{
          customerId: job.customer_id, typeId: job.job_type_id ?? "", contactName: job.contact_name ?? "", contactPhone: job.contact_phone ?? "", address: job.address ?? "", description: job.description ?? "",
          contract: toDbAmount(toPaisa(job.contract_value)), responsibleId: job.responsible_employee_id ?? "", date: job.job_date, startDate: job.start_date ?? "", dueDate: job.due_date ?? "", notes: job.notes ?? "",
          requestId: crypto.randomUUID(),
          lines: job.items.map((l) => ({
            id: l.id, kind: l.kind as "service", serviceId: l.service_id ?? "", productId: l.product_id ?? "", unitId: l.unit_id ?? "", description: l.description ?? "", quantity: String(l.quantity),
            price: toDbAmount(toPaisa(l.unit_price)), cost: costs.get(l.id) ?? "",
          })),
        }}
      />
    </>
  );
}
