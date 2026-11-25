"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import type { Permission } from "@/lib/auth/permissions";
import { runAction } from "@/lib/server-action";
import { sqlNull } from "@/lib/supabase/rpc";
import { createClient } from "@/lib/supabase/server";
import { maskAccount } from "@/lib/utils/mask";
import { money, orNull, positiveMoney } from "@/lib/validation/common";
import { arrivalSchema, buySchema, jobSchema, orderSchema, plannedSchema, sentLines, serviceSchema, solPaymentSchema, solReturnSchema, typeSchema } from "./schema";

const uuid = z.uuid();
const idOrNull = (id: string | null) => sqlNull(id === null ? null : uuid.parse(id));
const withReason = z.object({ id: uuid, reason: z.string().trim().min(1, "required").max(300, "tooLong") });

export async function saveJobAction(id: string | null, values: unknown): Promise<ActionResult<string>> {
  return runAction("sol.manage", jobSchema, values, async (v) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("save_sol_job", {
      p_id: idOrNull(id),
      p_doc: {
        customer_id: v.customerId, job_type_id: v.typeId, contact_name: orNull(v.contactName), contact_phone: orNull(v.contactPhone), address: orNull(v.address),
        description: orNull(v.description), contract_value: v.contract, responsible_employee_id: orNull(v.responsibleId), date: v.date, start_date: orNull(v.startDate),
        due_date: orNull(v.dueDate), notes: orNull(v.notes), client_request_id: v.requestId,
      },
      p_lines: v.lines.map((l) => ({
        id: orNull(l.id), kind: l.kind, service_id: l.kind === "service" ? orNull(l.serviceId) : null, product_id: l.kind === "product" ? orNull(l.productId) : null,
        unit_id: l.kind === "product" ? orNull(l.unitId) : null, description: orNull(l.description), quantity: l.quantity, unit_price: orNull(l.price) ?? "0", unit_cost: orNull(l.cost),
      })),
    });
    if (error) throw error;
    return data;
  });
}

export async function saveOrderAction(id: string | null, values: unknown): Promise<ActionResult<string>> {
  return runAction("sol.manage", orderSchema, values, async (v) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("save_sol_order", {
      p_id: idOrNull(id),
      p_doc: {
        customer_id: v.customerId, contact_name: orNull(v.contactName), contact_phone: orNull(v.contactPhone), address: orNull(v.address), description: orNull(v.description),
        responsible_employee_id: orNull(v.responsibleId), date: v.date, start_date: orNull(v.startDate), due_date: orNull(v.dueDate), notes: orNull(v.notes), client_request_id: v.requestId,
      },
      p_lines: v.lines.map((l) => ({ id: orNull(l.id), product_id: l.productId, unit_id: l.unitId, quantity: l.quantity, unit_price: l.price, unit_cost: orNull(l.cost) })),
    });
    if (error) throw error;
    return data;
  });
}

/** Orders the goods of a distributor order from Ayra and returns the purchase order. The database asks for sol.manage too. */
export async function buyForOrderAction(values: unknown): Promise<ActionResult<string>> {
  return runAction("purchasing.create", buySchema, values, async (v) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("order_sol_goods", {
      p_job_id: v.jobId, p_doc: { warehouse_id: v.warehouseId, date: v.date, expected_date: orNull(v.expectedDate), notes: orNull(v.notes), client_request_id: v.requestId },
      p_lines: v.lines.filter((l) => /[1-9]/.test(l.quantity)).map((l) => ({ product_id: l.productId, unit_id: l.unitId, quantity: l.quantity, unit_price: l.price })),
    });
    if (error) throw error;
    return data;
  });
}

async function setStatus(id: string, status: "confirmed" | "in_progress"): Promise<ActionResult<null>> {
  return runAction("sol.manage", uuid, id, async (v) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("set_sol_job_status", { p_id: v, p_status: status });
    if (error) throw error;
    return null;
  });
}
export async function confirmJobAction(id: string) { return setStatus(id, "confirmed"); }
export async function startJobAction(id: string) { return setStatus(id, "in_progress"); }

export async function completeJobAction(id: string): Promise<ActionResult<null>> {
  return runAction("sol.post", uuid, id, async (v) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("complete_sol_job", { p_id: v });
    if (error) throw error;
    return null;
  });
}

async function runWithReason(rpc: "cancel_sol_job" | "reopen_sol_job", permission: Permission, id: string, reason: string): Promise<ActionResult<null>> {
  return runAction(permission, withReason, { id, reason }, async (v) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc(rpc, { p_id: v.id, p_reason: v.reason });
    if (error) throw error;
    return null;
  });
}
export async function cancelJobAction(id: string, reason: string) { return runWithReason("cancel_sol_job", "sol.manage", id, reason); }
export async function reopenJobAction(id: string, reason: string) { return runWithReason("reopen_sol_job", "sol.post", id, reason); }

async function runOnId(rpc: "delete_sol_job" | "dispatch_sol_delivery" | "cancel_sol_delivery", permissions: Permission | readonly Permission[], id: string): Promise<ActionResult<null>> {
  return runAction(permissions, uuid, id, async (v) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc(rpc, { p_id: v });
    if (error) throw error;
    return null;
  });
}
export async function deleteJobAction(id: string) { return runOnId("delete_sol_job", "sol.manage", id); }
export async function dispatchSolAction(id: string) { return runOnId("dispatch_sol_delivery", "sol.dispatch", id); }
export async function cancelSolDeliveryAction(id: string) { return runOnId("cancel_sol_delivery", ["sol.dispatch", "sol.manage"], id); }

export async function savePlannedAction(id: string | null, values: unknown): Promise<ActionResult<string>> {
  return runAction(["sol.dispatch", "sol.manage"], plannedSchema, values, async (v) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("save_sol_delivery", {
      p_id: idOrNull(id), p_job_id: v.jobId,
      p_doc: {
        vehicle_id: orNull(v.vehicleId), driver_id: orNull(v.driverId), warehouse_id: orNull(v.warehouseId), date: v.date, destination: v.destination,
        odometer_start: orNull(v.odometerStart), notes: orNull(v.notes), client_request_id: v.requestId,
      },
      p_lines: sentLines(v.lines).map((l) => ({ job_item_id: l.itemId, quantity: l.quantity })),
    });
    if (error) throw error;
    return data;
  });
}

/** Drivers confirm their own deliveries without sol.dispatch, so the database decides. */
export async function completeSolDeliveryAction(values: unknown): Promise<ActionResult<string>> {
  return runAction(["sol.dispatch", "sol.view"], arrivalSchema, values, async (v) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("complete_sol_delivery", {
      p_id: v.id,
      p_doc: { received_by: orNull(v.receivedBy), notes: orNull(v.notes), odometer_end: orNull(v.odometerEnd), warehouse_id: orNull(v.warehouseId), return_reason: orNull(v.returnReason) },
      p_returns: sentLines(v.lines).map((l) => ({ delivery_item_id: l.itemId, quantity: l.quantity })),
    });
    if (error) throw error;
    return data;
  });
}

export async function returnSolGoodsAction(values: unknown): Promise<ActionResult<string>> {
  return runAction("sol.dispatch", solReturnSchema, values, async (v) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("return_sol_goods", {
      p_delivery_id: v.deliveryId, p_doc: { warehouse_id: orNull(v.warehouseId), reason: v.reason, client_request_id: v.requestId },
      p_lines: sentLines(v.lines).map((l) => ({ delivery_item_id: l.itemId, quantity: l.quantity })),
    });
    if (error) throw error;
    return v.deliveryId;
  });
}

export async function recordSolPaymentAction(values: unknown): Promise<ActionResult<string>> {
  return runAction(["receivables.collect", "receivables.post"], solPaymentSchema, values, async (v) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("record_sol_payment", {
      p_job_id: v.jobId,
      p_doc: {
        date: v.date, amount: v.amount, method: v.method, financial_account_id: v.accountId, payer_account: maskAccount(v.payerAccount), reference: orNull(v.reference),
        notes: orNull(v.notes), client_request_id: v.requestId,
      },
    });
    if (error) throw error;
    return v.jobId;
  });
}

export async function releasePaymentAction(paymentId: string, jobId: string): Promise<ActionResult<null>> {
  return runAction("receivables.post", z.object({ paymentId: uuid, jobId: uuid }), { paymentId, jobId }, async (v) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("release_sol_payment", { p_payment_id: v.paymentId, p_job_id: v.jobId });
    if (error) throw error;
    return null;
  });
}

export async function applyPaymentAction(paymentId: string, jobId: string, amount: string): Promise<ActionResult<null>> {
  return runAction("receivables.post", z.object({ paymentId: uuid, jobId: uuid, amount: positiveMoney }), { paymentId, jobId, amount }, async (v) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("allocate_payment_to_sol_job", { p_payment_id: v.paymentId, p_job_id: v.jobId, p_amount: sqlAmount(v.amount) });
    if (error) throw error;
    return null;
  });
}

// PostgREST accepts numeric arguments as exact decimal strings; the generated type says number.
const sqlAmount = (value: z.infer<typeof money>) => value as unknown as number;

export async function saveTypeAction(id: string | null, values: unknown): Promise<ActionResult<null>> {
  return runAction("sol.manage", typeSchema, values, async (v) => {
    const supabase = await createClient();
    const record = { name_en: v.nameEn, name_ur: orNull(v.nameUr), uses_services: v.usesServices, uses_products: v.usesProducts, uses_deliveries: v.usesDeliveries, is_active: v.isActive };
    const { error } = id ? await supabase.from("sol_job_types").update(record).eq("id", uuid.parse(id)) : await supabase.from("sol_job_types").insert(record);
    if (error) throw error;
    return null;
  });
}

export async function saveServiceAction(id: string | null, values: unknown): Promise<ActionResult<null>> {
  return runAction("sol.manage", serviceSchema, values, async (v) => {
    const supabase = await createClient();
    const record = { name_en: v.nameEn, name_ur: orNull(v.nameUr), unit_label: orNull(v.unitLabel), unit_label_ur: orNull(v.unitLabelUr), default_price: orNull(v.price), is_active: v.isActive };
    const { error } = id ? await supabase.from("sol_services").update(record).eq("id", uuid.parse(id)) : await supabase.from("sol_services").insert(record);
    if (error) throw error;
    return null;
  });
}
