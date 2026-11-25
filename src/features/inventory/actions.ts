"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import type { Permission } from "@/lib/auth/permissions";
import { runAction } from "@/lib/server-action";
import { sqlNull } from "@/lib/supabase/rpc";
import { createClient } from "@/lib/supabase/server";
import { orNull } from "@/lib/validation/common";
import { adjustmentSchema, countSchema, dispatchSchema, storedQuantity, transferSchema } from "./schema";

const uuid = z.uuid();
const idOrNull = (id: string | null) => sqlNull(id === null ? null : uuid.parse(id));

export async function saveTransferAction(id: string | null, values: unknown): Promise<ActionResult<string>> {
  return runAction("inventory.transfer", transferSchema, values, async (v) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("save_stock_transfer", {
      p_id: idOrNull(id),
      p_doc: { from_warehouse_id: v.fromId, to_warehouse_id: v.toId, date: v.date, notes: orNull(v.notes), client_request_id: v.requestId },
      p_lines: v.lines.map((l) => ({ product_id: l.productId, unit_id: l.unitId, quantity: l.quantity })),
    });
    if (error) throw error;
    return data;
  });
}

export async function saveCountAction(id: string | null, values: unknown): Promise<ActionResult<string>> {
  return runAction("inventory.count", countSchema, values, async (v) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("save_stock_count", {
      p_id: idOrNull(id),
      p_doc: { warehouse_id: v.warehouseId, date: v.date, notes: orNull(v.notes) },
      p_lines: v.lines.filter((l) => l.counted !== "").map((l) => ({ product_id: l.productId, counted_quantity: l.counted, notes: orNull(l.notes) })),
    });
    if (error) throw error;
    return data;
  });
}

export async function saveAdjustmentAction(id: string | null, values: unknown): Promise<ActionResult<string>> {
  return runAction("inventory.adjust", adjustmentSchema, values, async (v) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("save_stock_adjustment", {
      p_id: idOrNull(id),
      p_doc: { warehouse_id: v.warehouseId, date: v.date, kind: v.kind, reason: orNull(v.reason), client_request_id: v.requestId },
      p_lines: v.lines.map((l) => ({
        product_id: l.productId, unit_id: l.unitId, quantity: storedQuantity(v.kind, l.quantity),
        // Stock leaves at its average cost; only stock coming in can be given one.
        unit_cost: v.kind === "write_off" || l.quantity.startsWith("-") ? null : orNull(l.cost), notes: orNull(l.notes),
      })),
    });
    if (error) throw error;
    return data;
  });
}

async function post(rpc: "post_stock_transfer" | "post_stock_count" | "post_stock_adjustment", permission: Permission, id: string): Promise<ActionResult<null>> {
  return runAction(permission, uuid, id, async (v) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc(rpc, { p_id: v });
    if (error) throw error;
    return null;
  });
}
export async function postTransferAction(id: string) { return post("post_stock_transfer", "inventory.transfer", id); }
export async function postCountAction(id: string) { return post("post_stock_count", "inventory.adjust", id); }
export async function postAdjustmentAction(id: string) { return post("post_stock_adjustment", "inventory.adjust", id); }

const DRAFTS = { stock_transfers: "inventory.transfer", stock_counts: "inventory.count", stock_adjustments: "inventory.adjust" } as const;

export async function deleteInventoryDraftAction(table: keyof typeof DRAFTS, id: string): Promise<ActionResult<null>> {
  const name = z.enum(["stock_transfers", "stock_counts", "stock_adjustments"]).parse(table);
  return runAction(DRAFTS[name], uuid, id, async (v) => {
    const supabase = await createClient();
    // Row level security allows deleting drafts only; zero rows means it was already processed.
    const { data, error } = await supabase.from(name).delete().eq("id", v).eq("status", "draft").select("id");
    if (error) throw error;
    if (!data.length) throw Object.assign(new Error("The draft was not found or has already been processed"), { code: "P0002" });
    return null;
  });
}

/** Saves the delivery and dispatches it. A repeated submit of the same form returns the first result. */
export async function dispatchAction(values: unknown): Promise<ActionResult<string>> {
  return runAction("sales.dispatch", dispatchSchema, values, async (v) => {
    const supabase = await createClient();
    const { data: id, error } = await supabase.rpc("save_delivery", {
      p_order_id: v.orderId,
      p_doc: { vehicle_id: orNull(v.vehicleId), driver_id: orNull(v.driverId), supplied_by: orNull(v.suppliedBy), date: v.date, notes: orNull(v.notes), client_request_id: v.requestId },
      p_lines: v.lines.filter((l) => /[1-9]/.test(l.quantity)).map((l) => ({ sales_order_item_id: l.itemId, quantity: l.quantity })),
    });
    if (error) throw error;
    const { data: saved, error: readError } = await supabase.from("deliveries").select("status").eq("id", id).maybeSingle();
    if (readError) throw readError;
    if (saved && saved.status !== "draft") return id;
    const { error: dispatchError } = await supabase.rpc("dispatch_delivery", { p_id: id });
    if (dispatchError) {
      // Leave nothing half done: the corrected form is saved as a new delivery.
      await supabase.from("deliveries").delete().eq("id", id).eq("status", "draft");
      throw dispatchError;
    }
    return id;
  });
}
