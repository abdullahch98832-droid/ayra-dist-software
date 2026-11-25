import "server-only";
import { financeReports } from "./definitions/finance";
import { inventoryReports } from "./definitions/inventory";
import { operationsReports } from "./definitions/operations";
import { purchasingReports } from "./definitions/purchasing";
import { salesReports } from "./definitions/sales";
import { solReports } from "./definitions/sol";
import type { ReportDefinition } from "./model";

/** Every report, in the order of the hub. */
export const REPORTS: readonly ReportDefinition[] = [...inventoryReports, ...salesReports, ...purchasingReports, ...solReports, ...financeReports, ...operationsReports];
const bySlug = new Map(REPORTS.map((r) => [r.slug, r]));
export const findReport = (slug: string): ReportDefinition | null => bySlug.get(slug) ?? null;
