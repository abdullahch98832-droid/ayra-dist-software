import type { Dictionary } from "@/i18n";
import type { BadgeTone } from "@/components/shared/status-badge";

export const ORDER_TONE: Record<string, BadgeTone> = {
  draft: "gray", submitted: "blue", approved: "blue", picking: "amber", partially_dispatched: "amber", dispatched: "amber", delivered: "green", completed: "green", cancelled: "gray",
};
export const PAY_TONE: Record<string, BadgeTone> = { unpaid: "red", partially_paid: "amber", paid: "green" };
export const DELIVERY_TONE: Record<string, BadgeTone> = { draft: "gray", dispatched: "amber", delivered: "green", cancelled: "gray" };
export const DOCUMENT_TONE: Record<string, BadgeTone> = { draft: "gray", posted: "green", void: "red" };

const options = (labels: Record<string, string>, tones: Record<string, BadgeTone>) =>
  Object.fromEntries(Object.entries(labels).map(([key, label]) => [key, { label, tone: tones[key] ?? ("gray" as const) }]));

/** Labels and colours for status columns. */
export const orderOptions = (t: Dictionary) => options(t.sales.statuses, ORDER_TONE);
export const payOptions = (t: Dictionary) => options(t.sales.payStatuses, PAY_TONE);
export const deliveryOptions = (t: Dictionary) => options(t.sales.deliveryStatuses, DELIVERY_TONE);
export const documentOptions = (t: Dictionary) => options({ draft: t.purchasing.statuses.draft, posted: t.purchasing.statuses.posted, void: t.purchasing.statuses.void }, DOCUMENT_TONE);

/** The steps of an order in order. Partly dispatched is part of the dispatch step. */
export const ORDER_STEPS = ["draft", "submitted", "approved", "picking", "dispatched", "delivered", "completed"] as const;
export const stepIndex = (status: string) => ORDER_STEPS.indexOf((status === "partially_dispatched" ? "dispatched" : status) as (typeof ORDER_STEPS)[number]);
