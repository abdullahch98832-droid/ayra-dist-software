import type { reportVehicleLog } from "@/features/fleet/queries";
import { solDeliveryOptions } from "@/features/sol/status";
import type { Dictionary } from "@/i18n";
import { SpecTable } from "@/components/tables/spec-table";

/** Trips of vehicles, shared by the trips tab, the vehicle page and the report. */
export function TripsTable({ t, local, rows, oneVehicle = false, toolbar, exportName, canOpen }: {
  t: Dictionary;
  local: (en: string, ur: string | null | undefined) => string;
  rows: Awaited<ReturnType<typeof reportVehicleLog>>;
  oneVehicle?: boolean;
  toolbar?: React.ReactNode;
  exportName?: string;
  canOpen: { sol: boolean; sales: boolean };
}) {
  const v = t.vehicles;
  return (
    <SpecTable
      caption={v.trips}
      rows={rows.map((x) => {
        const sol = x.kind === "sol";
        const link = sol ? canOpen.sol : canOpen.sales;
        return {
          id: x.delivery_id, no: x.doc_no, noHref: link ? (sol ? `/sol/deliveries/${x.delivery_id}` : `/sales/deliveries/${x.delivery_id}`) : undefined, kind: sol ? v.tripKinds.sol : v.tripKinds.sales, date: x.delivery_date, vehicle: x.registration_no,
          driver: x.driver_en ? local(x.driver_en, x.driver_ur) : null, source: x.source_no, sourceHref: link ? (sol ? `/sol/jobs/${x.source_id}` : `/sales/orders/${x.source_id}`) : undefined, client: local(x.client, x.client_ur), destination: x.destination,
          status: x.status, dispatched: x.dispatched_at, delivered: x.delivered_at, distance: x.odometer_end !== null && x.odometer_start !== null ? x.odometer_end - x.odometer_start : null,
        };
      })}
      columns={[
        { key: "no", sub: "kind", label: t.documents.number, kind: "link", primary: true }, { key: "date", label: t.documents.date, kind: "date" },
        ...(oneVehicle ? [] : [{ key: "vehicle", label: t.sol.vehicle, kind: "code" as const }]),
        { key: "source", label: v.source, kind: "link" }, { key: "client", sub: "destination", label: v.client, kind: "text" }, { key: "driver", label: v.driver, kind: "text", hideBelow: "lg" },
        { key: "dispatched", label: t.sol.dispatchedAt, kind: "datetime", hideBelow: "2xl" }, { key: "delivered", label: t.sol.deliveredAt, kind: "datetime", hideBelow: "xl" }, { key: "distance", label: v.distance, kind: "quantity", hideBelow: "lg", total: true },
        { key: "status", label: t.common.status, kind: "status", options: solDeliveryOptions(t) },
      ]}
      searchKeys={["no", "vehicle", "source", "client", "destination", "driver"]}
      toolbar={toolbar}
      exportName={exportName}
      empty={{ title: v.tripEmpty }}
    />
  );
}
