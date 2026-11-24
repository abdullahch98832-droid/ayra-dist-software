"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import type { Permission } from "@/lib/auth/permissions";
import { can } from "@/lib/auth/session";
import { runAction } from "@/lib/server-action";
import { sqlNull } from "@/lib/supabase/rpc";
import { createClient } from "@/lib/supabase/server";
import { orNull } from "@/lib/validation/common";
import { deliverySchema, orderSchema, returnedLines, returnSchema } from "./schema";

const uuid = z.uuid();
const idOrNull = (id: string | null) => sqlNull(id === null ? null : uuid.parse(id));
const withReason = z.object({ id: uuid, reason: z.string().trim().min(1, "required").max(300, "tooLong") });

export async function saveOrderAction(id: string | null, values: unknown): Promise<ActionResult<string>> {
  return runAction(["sales.create", "sales.approve"], orderSchema, values, async (v, ctx) => {
    const supabase = await createClient();
    // Order takers always sell in their own name; the database refuses anything else.
    const taker = can(ctx, "sales.view_all") ? orNull(v.orderTakerId) : ctx.employeeId;
    const { data, error } = await supabase.rpc("save_sales_order", {
      p_id: idOrNull(id),
      p_doc: {
        customer_id: v.customerId, order_taker_id: taker, warehouse_id: v.warehouseId, date: v.date, required_date: orNull(v.requiredDate),
        notes: orNull(v.notes), client_request_id: v.requestId,
      },
      p_lines: v.lines.map((l) => ({ product_id: l.productId, unit_id: l.unitId, quantity: l.quantity, unit_price: l.price, discount_amount: orNull(l.discount) ?? "0" })),
    });
    if (error) throw error;
    return data;
  });
}

type SimpleRpc = "submit_sales_order" | "start_picking" | "post_customer_return";
async function run(rpc: SimpleRpc, permission: Permission, id: string): Promise<ActionResult<null>> {
  return runAction(permission, uuid, id, async (v) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc(rpc, { p_id: v });
    if (error) throw error;
    return null;
  });
}
export async function submitOrderAction(id: string) { return run("submit_sales_order", "sales.create", id); }
export async function startPickingAction(id: string) { return run("start_picking", "sales.dispatch", id); }
export async function postReturnAction(id: string) { return run("post_customer_return", "sales.return", id); }

export async function approveOrderAction(id: string, override: boolean): Promise<ActionResult<null>> {
  return runAction("sales.approve", z.object({ id: uuid, override: z.boolean() }), { id, override }, async (v) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("approve_sales_order", { p_id: v.id, p_override_credit: v.override });
    if (error) throw error;
    return null;
  });
}

async function runWithReason(rpc: "send_back_sales_order" | "cancel_sales_order" | "close_sales_order", id: string, reason: string): Promise<ActionResult<null>> {
  return runAction("sales.approve", withReason, { id, reason }, async (v) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc(rpc, { p_id: v.id, p_reason: v.reason });
    if (error) throw error;
    return null;
  });
}
export async function sendBackOrderAction(id: string, reason: string) { return runWithReason("send_back_sales_order", id, reason); }
export async function cancelOrderAction(id: string, reason: string) { return runWithReason("cancel_sales_order", id, reason); }
export async function closeOrderAction(id: string, reason: string) { return runWithReason("close_sales_order", id, reason); }

const DRAFTS = { sales_orders: "sales.create", customer_returns: "sales.return" } as const;
export async function deleteSalesDraftAction(table: keyof typeof DRAFTS, id: string): Promise<ActionResult<null>> {
  const name = z.enum(["sales_orders", "customer_returns"]).parse(table);
  return runAction(DRAFTS[name], uuid, id, async (v) => {
    const supabase = await createClient();
    const { data, error } = await supabase.from(name).delete().eq("id", v).eq("status", "draft").select("id");
    if (error) throw error;
    if (!data.length) throw Object.assign(new Error("The draft was not found or has already been processed"), { code: "P0002" });
    return null;
  });
}

/** Drivers confirm their own deliveries without sales.dispatch, so the database decides. */
export async function completeDeliveryAction(values: unknown): Promise<ActionResult<string>> {
  return runAction(["sales.dispatch", "sales.view"], deliverySchema, values, async (v) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("complete_delivery", {
      p_id: v.id,
      p_doc: { received_by: orNull(v.receivedBy), notes: orNull(v.notes), return_reason: orNull(v.returnReason) },
      p_returns: v.lines.filter((l) => /[1-9]/.test(l.quantity)).map((l) => ({ delivery_item_id: l.itemId, quantity: l.quantity, condition: l.condition })),
    });
    if (error) throw error;
    return data;
  });
}

export async function saveReturnAction(id: string | null, values: unknown): Promise<ActionResult<string>> {
  return runAction("sales.return", returnSchema, values, async (v) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("save_customer_return", {
      p_id: idOrNull(id),
      p_doc: {
        customer_id: v.customerId, sales_invoice_id: orNull(v.invoiceId), warehouse_id: v.warehouseId, damaged_warehouse_id: orNull(v.damagedWarehouseId),
        date: v.date, reason: orNull(v.reason), client_request_id: v.requestId,
      },
      p_lines: returnedLines(v).map((l) => ({
        sales_invoice_item_id: orNull(l.invoiceItemId), product_id: l.productId, unit_id: l.unitId, quantity: l.quantity, unit_price: orNull(l.price) ?? "0", condition: l.condition,
      })),
    });
    if (error) throw error;
    return data;
  });
}
