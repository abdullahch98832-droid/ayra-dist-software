"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import type { Permission } from "@/lib/auth/permissions";
import { runAction } from "@/lib/server-action";
import { sqlNull } from "@/lib/supabase/rpc";
import { createClient } from "@/lib/supabase/server";
import { orNull } from "@/lib/validation/common";
import { accountSchema, closingSchema, openingSchema, reconciliationSaveSchema, reconciliationSchema, transferSchema, voucherSchema } from "./schema";

export async function saveAccountAction(id: string | null, values: unknown): Promise<ActionResult<string>> {
  return runAction("cash_bank.manage", accountSchema, values, async (v) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("save_financial_account", {
      p_id: sqlNull(id === null ? null : z.uuid().parse(id)),
      p_doc: {
        name: v.name, account_type: v.type, bank_name: orNull(v.bankName), account_title: orNull(v.accountTitle), account_number: orNull(v.accountNumber), iban: orNull(v.iban),
        branch: orNull(v.branch), notes: orNull(v.notes), is_active: v.isActive,
      },
    });
    if (error) throw error;
    return data;
  });
}

const uuid = z.uuid();
const reasoned = z.object({ id: uuid, reason: z.string().trim().min(1, "required").max(300, "tooLong") });
// PostgREST accepts numeric arguments as exact decimal strings; the generated type says number.
const exact = (value: string) => value as unknown as number;

export async function recordOpeningAction(values: unknown): Promise<ActionResult<string>> {
  return runAction("cash_bank.manage", openingSchema, values, async (v) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("record_account_opening", { p_account_id: v.accountId, p_amount: exact(v.amount), p_date: v.date });
    if (error) throw error;
    return data;
  });
}

export async function recordTransferAction(values: unknown): Promise<ActionResult<string>> {
  return runAction("cash_bank.transfer", transferSchema, values, async (v) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("record_fund_transfer", {
      p_doc: { from_account_id: v.fromId, to_account_id: v.toId, date: v.date, amount: v.amount, method: v.method, reference: orNull(v.reference), notes: orNull(v.notes), client_request_id: v.requestId },
    });
    if (error) throw error;
    return data;
  });
}

export async function recordVoucherAction(values: unknown): Promise<ActionResult<string>> {
  return runAction("accounting.journal", voucherSchema, values, async (v) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("record_cash_voucher", {
      p_doc: {
        kind: v.kind, date: v.date, financial_account_id: v.accountId, counter_account_id: v.counterId, amount: v.amount, party_name: orNull(v.party), method: v.method, reference: orNull(v.reference),
        description: v.description, client_request_id: v.requestId, contributors: v.contributors,
      },
    });
    if (error) throw error;
    return data;
  });
}

async function withReason(rpc: "void_account_opening" | "void_fund_transfer" | "void_cash_voucher" | "reopen_cash_day" | "reopen_bank_reconciliation", permission: Permission, id: string, reason: string): Promise<ActionResult<null>> {
  return runAction(permission, reasoned, { id, reason }, async (v) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc(rpc, { p_id: v.id, p_reason: v.reason });
    if (error) throw error;
    return null;
  });
}
export async function voidOpeningAction(id: string, reason: string) { return withReason("void_account_opening", "cash_bank.manage", id, reason); }
export async function voidTransferAction(id: string, reason: string) { return withReason("void_fund_transfer", "cash_bank.transfer", id, reason); }
export async function voidVoucherAction(id: string, reason: string) { return withReason("void_cash_voucher", "accounting.journal", id, reason); }
export async function reopenDayAction(id: string, reason: string) { return withReason("reopen_cash_day", "cash_bank.close", id, reason); }

export async function closeDayAction(values: unknown): Promise<ActionResult<string>> {
  return runAction("cash_bank.close", closingSchema, values, async (v) => {
    const supabase = await createClient();
    const counted = Object.fromEntries(Object.entries(v.denominations).filter(([, n]) => /[1-9]/.test(n)));
    const { data, error } = await supabase.rpc("close_cash_day", {
      p_account_id: v.accountId,
      p_doc: { date: v.date, counted: v.counted, notes: orNull(v.notes), post_difference: v.postDifference, denominations: Object.keys(counted).length ? counted : null, client_request_id: v.requestId },
    });
    if (error) throw error;
    return data;
  });
}

export async function startReconciliationAction(values: unknown): Promise<ActionResult<string>> {
  return runAction("cash_bank.reconcile", reconciliationSchema, values, async (v) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("start_bank_reconciliation", { p_account_id: v.accountId, p_doc: { statement_date: v.date, statement_balance: v.balance, client_request_id: v.requestId } });
    if (error) throw error;
    return data;
  });
}

/** Saves the ticks and, when asked, completes it; the database compares the totals again. */
export async function saveReconciliationAction(values: unknown): Promise<ActionResult<null>> {
  return runAction("cash_bank.reconcile", reconciliationSaveSchema, values, async (v) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("save_bank_reconciliation", { p_id: v.id, p_doc: { statement_balance: v.balance, notes: orNull(v.notes) }, p_lines: v.lines });
    if (error) throw error;
    if (!v.complete) return null;
    const { error: failed } = await supabase.rpc("complete_bank_reconciliation", { p_id: v.id });
    if (failed) throw failed;
    return null;
  });
}
export async function reopenReconciliationAction(id: string, reason: string) { return withReason("reopen_bank_reconciliation", "cash_bank.reconcile", id, reason); }
export async function deleteReconciliationAction(id: string): Promise<ActionResult<null>> {
  return runAction("cash_bank.reconcile", z.object({ id: uuid }), { id }, async (v) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("delete_bank_reconciliation", { p_id: v.id });
    if (error) throw error;
    return null;
  });
}
