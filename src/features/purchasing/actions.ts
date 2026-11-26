"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import type { Permission } from "@/lib/auth/permissions";
import { runAction } from "@/lib/server-action";
import { sqlNull } from "@/lib/supabase/rpc";
import { createClient } from "@/lib/supabase/server";
import { orNull } from "@/lib/validation/common";
import { billSchema, orderSchema, paymentSchema, receiptSchema, receivedLines, returnSchema } from "./schema";

const uuid = z.uuid();
const idOrNull = (id: string | null) => sqlNull(id === null ? null : uuid.parse(id));

export async function saveOrderAction(id: string | null, values: unknown): Promise<ActionResult<string>> {
  return runAction("purchasing.create", orderSchema, values, async (v) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("save_purchase_order", {
      p_id: idOrNull(id),
      p_doc: { supplier_id: v.supplierId, warehouse_id: v.warehouseId, date: v.date, expected_date: orNull(v.expectedDate), notes: orNull(v.notes), client_request_id: v.requestId },
      p_lines: v.lines.map((l) => ({ product_id: l.productId, unit_id: l.unitId, quantity: l.quantity, unit_price: l.price })),
    });
    if (error) throw error;
    return data;
  });
}

export async function saveReceiptAction(id: string | null, values: unknown): Promise<ActionResult<string>> {
  return runAction("purchasing.create", receiptSchema, values, async (v) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("save_goods_receipt", {
      p_id: idOrNull(id),
      p_doc: {
        supplier_id: v.supplierId, purchase_order_id: orNull(v.orderId), warehouse_id: v.warehouseId, damaged_warehouse_id: orNull(v.damagedWarehouseId),
        date: v.date, supplier_reference: orNull(v.reference), notes: orNull(v.notes), client_request_id: v.requestId,
      },
      p_lines: receivedLines(v).map((l) => ({
        purchase_order_item_id: orNull(l.orderItemId), product_id: l.productId, unit_id: l.unitId, expected_quantity: orNull(l.expected),
        quantity: orNull(l.accepted) ?? "0", damaged_quantity: orNull(l.damaged) ?? "0", rejected_quantity: orNull(l.rejected) ?? "0", unit_cost: l.cost, notes: orNull(l.notes),
      })),
    });
    if (error) throw error;
    return data;
  });
}

export async function saveBillAction(id: string | null, values: unknown): Promise<ActionResult<string>> {
  return runAction("purchasing.create", billSchema, values, async (v) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("save_supplier_invoice", {
      p_id: idOrNull(id),
      p_doc: { supplier_id: v.supplierId, invoice_number: v.number, date: v.date, due_date: orNull(v.dueDate), amount: v.amount, notes: orNull(v.notes) },
      p_receipts: v.receiptIds,
    });
    if (error) throw error;
    return data;
  });
}

export async function saveReturnAction(id: string | null, values: unknown): Promise<ActionResult<string>> {
  return runAction("purchasing.create", returnSchema, values, async (v) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("save_supplier_return", {
      p_id: idOrNull(id),
      p_doc: { supplier_id: v.supplierId, warehouse_id: v.warehouseId, date: v.date, reason: orNull(v.reason), client_request_id: v.requestId },
      p_lines: v.lines.map((l) => ({ product_id: l.productId, unit_id: l.unitId, quantity: l.quantity, unit_price: l.price })),
    });
    if (error) throw error;
    return data;
  });
}

export async function recordPaymentAction(values: unknown): Promise<ActionResult<string>> {
  // The database decides between the two by the supplier; holding one is enough to try.
  return runAction(["payables.pay", "company.pay"], paymentSchema, values, async (v) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("record_supplier_payment", {
      p_doc: {
        supplier_id: v.supplierId, date: v.date, amount: v.amount, financial_account_id: v.accountId, method: v.method,
        reference: orNull(v.reference), notes: orNull(v.notes), client_request_id: v.requestId, contributors: v.contributors,
      },
      p_allocations: v.allocations.filter((a) => /[1-9]/.test(a.amount)).map((a) => ({ invoice_id: a.billId, amount: a.amount })),
    });
    if (error) throw error;
    return data;
  });
}

type SimpleRpc = "approve_purchase_order" | "cancel_purchase_order" | "post_goods_receipt" | "post_supplier_invoice" | "post_supplier_return";

async function run(rpc: SimpleRpc, permission: Permission, id: string): Promise<ActionResult<null>> {
  return runAction(permission, uuid, id, async (v) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc(rpc, { p_id: v });
    if (error) throw error;
    return null;
  });
}
export async function approveOrderAction(id: string) { return run("approve_purchase_order", "purchasing.approve", id); }
export async function cancelOrderAction(id: string) { return run("cancel_purchase_order", "purchasing.approve", id); }
export async function postReceiptAction(id: string) { return run("post_goods_receipt", "purchasing.post", id); }
export async function postBillAction(id: string) { return run("post_supplier_invoice", "purchasing.post", id); }
export async function postReturnAction(id: string) { return run("post_supplier_return", "purchasing.post", id); }

export async function closeOrderAction(id: string, reason: string): Promise<ActionResult<null>> {
  return runAction("purchasing.approve", z.object({ id: uuid, reason: z.string().trim().min(1, "required").max(300, "tooLong") }), { id, reason }, async (v) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("close_purchase_order", { p_id: v.id, p_reason: v.reason });
    if (error) throw error;
    return null;
  });
}

export async function voidPaymentAction(id: string, reason: string): Promise<ActionResult<null>> {
  return runAction(["payables.pay", "company.pay"], z.object({ id: uuid, reason: z.string().trim().min(1, "required").max(300, "tooLong") }), { id, reason }, async (v) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("void_supplier_payment", { p_id: v.id, p_reason: v.reason });
    if (error) throw error;
    return null;
  });
}

const DRAFT_TABLES = ["purchase_orders", "goods_receipts", "supplier_invoices", "supplier_returns"] as const;

export async function deletePurchasingDraftAction(table: (typeof DRAFT_TABLES)[number], id: string): Promise<ActionResult<null>> {
  return runAction("purchasing.create", z.object({ table: z.enum(DRAFT_TABLES), id: uuid }), { table, id }, async (v) => {
    const supabase = await createClient();
    // Row level security allows deleting drafts only; zero rows means it was already processed.
    const { data, error } = await supabase.from(v.table).delete().eq("id", v.id).eq("status", "draft").select("id");
    if (error) throw error;
    if (!data.length) throw Object.assign(new Error("The draft was not found or has already been processed"), { code: "P0002" });
    return null;
  });
}
