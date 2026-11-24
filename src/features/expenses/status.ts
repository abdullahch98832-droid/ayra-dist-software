import type { Dictionary } from "@/i18n";
import type { BadgeTone } from "@/components/shared/status-badge";
import { EXPENSE_STATUSES } from "./schema";

export const EXPENSE_TONE: Record<string, BadgeTone> = { draft: "amber", posted: "green", rejected: "red", void: "gray" };
export const expenseOptions = (t: Dictionary) => Object.fromEntries(EXPENSE_STATUSES.map((s) => [s, { label: t.expenses.statuses[s], tone: EXPENSE_TONE[s] ?? ("gray" as const) }]));
