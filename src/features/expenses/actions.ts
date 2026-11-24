"use server";

import { randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { toActionError } from "@/lib/actions";
import { authorizeAny, runAction } from "@/lib/server-action";
import { createClient } from "@/lib/supabase/server";
import { orNull } from "@/lib/validation/common";
import { categorySchema, expenseSchema, type ExpenseValues } from "./schema";

const uuid = z.uuid();
const RECEIPT_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
const RECEIPT_MAX = 10 * 1024 * 1024;

/** Stores a receipt and returns its path; the voucher refers to it when it is saved. */
export async function uploadReceiptAction(formData: FormData): Promise<ActionResult<string>> {
  try {
    await authorizeAny(["expenses.create", "expenses.post"]);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { ok: false, code: "validation", fieldErrors: { file: ["required"] } };
    const ext = RECEIPT_TYPES[file.type];
    if (!ext) return { ok: false, code: "validation", fieldErrors: { file: ["receiptType"] } };
    if (file.size > RECEIPT_MAX) return { ok: false, code: "validation", fieldErrors: { file: ["receiptTooLarge"] } };
    const path = `expenses/${randomUUID()}.${ext}`;
    const supabase = await createClient();
    const { error } = await supabase.storage.from("attachments").upload(path, file, { contentType: file.type, upsert: false });
    if (error) return { ok: false, code: "rule", message: error.message };
    return { ok: true, data: path };
  } catch (error) {
    return toActionError(error);
  }
}

const document = (v: ExpenseValues) => ({
  date: v.date, category_id: v.categoryId, amount: v.amount, financial_account_id: v.accountId, method: v.method, reference: orNull(v.reference), payee: v.payee, description: v.description,
  vehicle_id: orNull(v.vehicleId), sol_job_id: orNull(v.jobId), litres: v.vehicleId === "" ? null : orNull(v.litres), odometer: v.vehicleId === "" ? null : orNull(v.odometer),
  receipt_path: orNull(v.receiptPath), no_receipt_reason: v.receiptPath === "" ? orNull(v.noReceiptReason) : null, client_request_id: v.requestId,
});

export async function recordExpenseAction(values: unknown): Promise<ActionResult<string>> {
  return runAction("expenses.create", expenseSchema, values, async (v) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("record_expense", { p_doc: document(v) });
    if (error) throw error;
    return data;
  });
}

export async function updateExpenseAction(id: string, values: unknown): Promise<ActionResult<string>> {
  return runAction(["expenses.create", "expenses.post"], expenseSchema, values, async (v) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("update_expense", { p_id: uuid.parse(id), p_doc: document(v) });
    if (error) throw error;
    return data;
  });
}

export async function attachReceiptAction(id: string, formData: FormData): Promise<ActionResult<null>> {
  const stored = await uploadReceiptAction(formData);
  if (!stored.ok || !stored.data) return stored.ok ? { ok: false, code: "unexpected" } : stored;
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("attach_expense_receipt", { p_id: uuid.parse(id), p_path: stored.data });
    if (error) throw error;
    refresh();
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function postExpenseAction(id: string): Promise<ActionResult<null>> {
  return runAction("expenses.post", uuid, id, async (v) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("post_expense", { p_id: v });
    if (error) throw error;
    return null;
  });
}

async function withReason(rpc: "void_expense" | "reject_expense", id: string, reason: string): Promise<ActionResult<null>> {
  return runAction("expenses.post", z.object({ id: uuid, reason: z.string().trim().min(1, "required").max(300, "tooLong") }), { id, reason }, async (v) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc(rpc, { p_id: v.id, p_reason: v.reason });
    if (error) throw error;
    return null;
  });
}
export async function voidExpenseAction(id: string, reason: string) { return withReason("void_expense", id, reason); }
export async function rejectExpenseAction(id: string, reason: string) { return withReason("reject_expense", id, reason); }

export async function deleteExpenseAction(id: string): Promise<ActionResult<null>> {
  return runAction(["expenses.create", "expenses.post"], uuid, id, async (v) => {
    const supabase = await createClient();
    const { data, error } = await supabase.from("expenses").delete().eq("id", v).eq("status", "draft").select("id");
    if (error) throw error;
    if (!data.length) throw Object.assign(new Error("The draft was not found or has already been processed"), { code: "P0002" });
    return null;
  });
}

export async function saveCategoryAction(id: string | null, values: unknown): Promise<ActionResult<null>> {
  return runAction("expenses.post", categorySchema, values, async (v) => {
    const supabase = await createClient();
    const record = { name_en: v.nameEn, name_ur: v.nameUr, gl_account_id: v.accountId, vehicle_kind: orNull(v.vehicleKind), is_active: v.isActive };
    const { error } = id ? await supabase.from("expense_categories").update(record).eq("id", uuid.parse(id)) : await supabase.from("expense_categories").insert({ ...record, code: v.code });
    if (error) throw error;
    return null;
  });
}
