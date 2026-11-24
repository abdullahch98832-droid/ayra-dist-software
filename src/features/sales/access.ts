import "server-only";
import { can, type SessionContext } from "@/lib/auth/session";

/** Mirrors private.can_edit_order(): drafts by whoever prepares them, submitted orders by an approver. */
export function canEditOrder(ctx: SessionContext, order: { status: string; order_taker_id: string | null }): boolean {
  const own = can(ctx, "sales.view_all") || (ctx.employeeId !== null && order.order_taker_id === ctx.employeeId);
  return (order.status === "draft" && can(ctx, "sales.create") && own) || (order.status === "submitted" && can(ctx, "sales.approve"));
}

/** Mirrors private.sees_settlements(): who may know what was paid on an invoice. */
export const seesSettlements = (ctx: SessionContext) => can(ctx, "receivables.view") || can(ctx, "receivables.collect") || can(ctx, "receivables.post");
