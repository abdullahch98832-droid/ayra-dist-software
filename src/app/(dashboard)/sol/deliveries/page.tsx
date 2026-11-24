import type { Metadata } from "next";
import { loadDriverList } from "@/features/fleet/queries";
import { loadSolDeliveries } from "@/features/sol/queries";
import { solDeliveryOptions } from "@/features/sol/status";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { LIST_PAGE, listParams } from "@/lib/list-params";
import { pageContext, uuidParam } from "@/lib/page-context";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { SpecTable } from "@/components/tables/spec-table";
import { UrlSearch, UrlSelect } from "@/components/tables/url-filters";

const STATUSES = ["draft", "dispatched", "delivered", "cancelled"] as const;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).sol.tabs.deliveries };
}

export default async function SolDeliveriesPage({ searchParams }: PageProps<"/sol/deliveries">) {
  const { ctx, t, local } = await pageContext();
  if (!can(ctx, "sol.view")) return <Forbidden />;
  const s = t.sol;
  const query = await searchParams;
  const filter = { ...listParams(query, STATUSES), vehicleId: uuidParam(query.vehicle) };
  const [{ rows, total }, drivers] = await Promise.all([loadSolDeliveries(filter), loadDriverList()]);
  const names = new Map(drivers.map((d) => [d.id, d]));
  return (
    <>
      <PageHeader title={s.tabs.deliveries} />
      <SpecTable
        caption={s.tabs.deliveries}
        rows={rows.map((x) => {
          const driver = names.get(x.driver_id ?? "");
          return {
            id: x.id, no: x.doc_no, noHref: `/sol/deliveries/${x.id}`, date: x.delivery_date, job: x.job?.doc_no, jobHref: x.job ? `/sol/jobs/${x.job.id}` : undefined, client: x.job?.customer ? local(x.job.customer.name, x.job.customer.name_ur) : null,
            destination: x.destination, vehicle: x.vehicle?.registration_no, driver: driver ? local(driver.nameEn, driver.nameUr) : null, status: x.status,
          };
        })}
        columns={[
          { key: "no", label: t.documents.number, kind: "link", primary: true }, { key: "date", label: s.deliveryDate, kind: "date" }, { key: "job", label: s.job, kind: "link" },
          { key: "client", sub: "destination", label: s.client, kind: "text" }, { key: "vehicle", label: s.vehicle, kind: "code", hideBelow: "lg" }, { key: "driver", label: s.driver, kind: "text", hideBelow: "xl" },
          { key: "status", label: t.common.status, kind: "status", options: solDeliveryOptions(t) },
        ]}
        server={{ page: filter.page, pageSize: LIST_PAGE, total }}
        toolbar={<><UrlSearch placeholder={t.documents.searchNumber} /><UrlSelect param="status" label={t.documents.allStatuses} options={STATUSES.map((x) => ({ value: x, label: s.deliveryStatuses[x] }))} /></>}
        empty={{ title: s.deliveryEmpty, description: s.deliveryEmptyHint }}
      />
    </>
  );
}
