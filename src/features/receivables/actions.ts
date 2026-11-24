"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import type { Permission } from "@/lib/auth/permissions";
import { authorizeAny, runAction } from "@/lib/server-action";
import { createClient } from "@/lib/supabase/server";
import { orNull } from "@/lib/validation/common";
import { loadOpenInvoices } from "./queries";
import { depositSchema, HELD, noteSchema, paymentSchema, settleSchema, type OpenInvoice } from "./schema";

const uuid = z.uuid();
const withReason = z.object({ id: uuid, reason: z.string().trim().min(1, "required").max(300, "tooLong") });
const chosen = (a: { amount: string }) => /[1-9]/.test(a.amount);

export async function recordPaymentAction(values: unknown): Promise<ActionResult<string>> {
  return runAction("receivables.collect", paymentSchema, values, async (v) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("record_customer_payment", {
      p_doc: {
        customer_id: v.customerId, date: v.date, amount: v.amount, method: v.method, financial_account_id: v.destination === HELD ? null : v.destination,
        collected_by: orNull(v.collectedBy), reference: orNull(v.reference), notes: orNull(v.notes), client_request_id: v.requestId,
      },
      p_allocations: v.allocations.filter(chosen).map((a) => ({ invoice_id: a.invoiceId, amount: a.amount })),
    });
    if (error) throw error;
    return data;
  });
}

/** Unpaid invoices of the customer being paid for. */
export async function openInvoicesAction(customerId: unknown): Promise<OpenInvoice[]> {
  await authorizeAny(["receivables.collect", "receivables.adjust", "receivables.post"]);
  const parsed = uuid.safeParse(customerId);
  return parsed.success ? loadOpenInvoices(parsed.data) : [];
}

async function run(rpc: "post_customer_payment" | "post_cash_deposit", permission: Permission, id: string): Promise<ActionResult<null>> {
  return runAction(permission, uuid, id, async (v) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc(rpc, { p_id: v });
    if (error) throw error;
    return null;
  });
}
export async function postPaymentAction(id: string) { return run("post_customer_payment", "receivables.post", id); }
export async function postDepositAction(id: string) { return run("post_cash_deposit", "receivables.post", id); }

async function voidWith(rpc: "void_customer_payment" | "void_cash_deposit" | "void_customer_note", permission: Permission, id: string, reason: string): Promise<ActionResult<null>> {
  return runAction(permission, withReason, { id, reason }, async (v) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc(rpc, { p_id: v.id, p_reason: v.reason });
    if (error) throw error;
    return null;
  });
}
export async function voidPaymentAction(id: string, reason: string) { return voidWith("void_customer_payment", "receivables.post", id, reason); }
export async function voidDepositAction(id: string, reason: string) { return voidWith("void_cash_deposit", "receivables.post", id, reason); }
export async function voidNoteAction(id: string, reason: string) { return voidWith("void_customer_note", "receivables.adjust", id, reason); }

export async function settleInvoicesAction(values: unknown): Promise<ActionResult<null>> {
  return runAction("receivables.post", settleSchema, values, async (v) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("settle_invoices", {
      p_payment_id: v.paymentId, p_allocations: v.allocations.filter(chosen).map((a) => ({ invoice_id: a.invoiceId, amount: a.amount })),
    });
    if (error) throw error;
    return null;
  });
}

const DRAFTS = ["customer_payments", "cash_deposits"] as const;
export async function deleteReceivableDraftAction(table: (typeof DRAFTS)[number], id: string): Promise<ActionResult<null>> {
  return runAction("receivables.collect", z.object({ table: z.enum(DRAFTS), id: uuid }), { table, id }, async (v) => {
    const supabase = await createClient();
    const { data, error } = await supabase.from(v.table).delete().eq("id", v.id).eq("status", "draft").select("id");
    if (error) throw error;
    if (!data.length) throw Object.assign(new Error("The draft was not found or has already been processed"), { code: "P0002" });
    return null;
  });
}

export async function recordDepositAction(values: unknown): Promise<ActionResult<string>> {
  return runAction(["receivables.collect", "receivables.post"], depositSchema, values, async (v) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("record_cash_deposit", {
      p_doc: { employee_id: v.employeeId, date: v.date, amount: v.amount, financial_account_id: v.accountId, reference: orNull(v.reference), notes: orNull(v.notes), client_request_id: v.requestId },
    });
    if (error) throw error;
    return data;
  });
}

export async function reconcileAction(values: unknown): Promise<ActionResult<string>> {
  const schema = z.object({ employeeId: uuid, counted: z.string().trim().regex(/^\d{1,13}(\.\d{1,2})?$/, "invalidAmount"), notes: z.string().trim().max(300, "tooLong") });
  return runAction("receivables.post", schema, values, async (v) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("reconcile_collector_cash", { p_employee_id: v.employeeId, p_counted: v.counted as unknown as number, p_notes: v.notes });
    if (error) throw error;
    return data;
  });
}

export async function recordNoteAction(values: unknown): Promise<ActionResult<string>> {
  return runAction("receivables.adjust", noteSchema, values, async (v) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("record_customer_note", {
      p_doc: {
        kind: v.kind, customer_id: v.customerId, sales_invoice_id: v.kind === "credit" ? orNull(v.invoiceId) : null, date: v.date, amount: v.amount,
        reason: orNull(v.reason), client_request_id: v.requestId,
      },
    });
    if (error) throw error;
    return data;
  });
}
