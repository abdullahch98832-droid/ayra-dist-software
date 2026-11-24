"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import type { Permission } from "@/lib/auth/permissions";
import { runAction } from "@/lib/server-action";
import { createClient } from "@/lib/supabase/server";
import { orNull } from "@/lib/validation/common";
import { advanceSchema, monthSchema, paySchema, payrollSchema, salarySchema } from "./schema";

const uuid = z.uuid();
const reasoned = z.object({ id: uuid, reason: z.string().trim().min(1, "required").max(300, "tooLong") });

export async function preparePayrollAction(values: unknown): Promise<ActionResult<string>> {
  return runAction("payroll.manage", z.object({ month: monthSchema }), values, async (v) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("prepare_payroll", { p_month: `${v.month}-01` });
    if (error) throw error;
    return data;
  });
}

export async function savePayrollAction(id: string, values: unknown): Promise<ActionResult<string>> {
  return runAction("payroll.manage", payrollSchema, values, async (v) => {
    const supabase = await createClient();
    const money = (x: string) => orNull(x) ?? "0";
    const { data, error } = await supabase.rpc("save_payroll", {
      p_id: uuid.parse(id), p_notes: v.notes,
      p_lines: v.lines.map((l) => ({
        employee_id: l.employeeId, basic_salary: money(l.basic), allowances: money(l.allowances), bonus: money(l.bonus), deductions: money(l.deductions), advance_recovery: money(l.recovery), notes: orNull(l.notes),
      })),
    });
    if (error) throw error;
    return data;
  });
}

export async function postPayrollAction(id: string): Promise<ActionResult<null>> {
  return runAction("payroll.post", uuid, id, async (v) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("post_payroll_run", { p_id: v });
    if (error) throw error;
    return null;
  });
}

async function withReason(rpc: "void_payroll_run" | "void_salary_payment" | "void_advance", permission: Permission, id: string, reason: string): Promise<ActionResult<null>> {
  return runAction(permission, reasoned, { id, reason }, async (v) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc(rpc, { p_id: v.id, p_reason: v.reason });
    if (error) throw error;
    return null;
  });
}
export async function voidPayrollAction(id: string, reason: string) { return withReason("void_payroll_run", "payroll.post", id, reason); }
export async function voidSalaryPaymentAction(id: string, reason: string) { return withReason("void_salary_payment", "payroll.pay", id, reason); }
export async function voidAdvanceAction(id: string, reason: string) { return withReason("void_advance", "payroll.pay", id, reason); }

export async function paySalariesAction(runId: string, values: unknown): Promise<ActionResult<string>> {
  return runAction("payroll.pay", paySchema, values, async (v) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("pay_salaries", {
      p_run_id: uuid.parse(runId),
      p_doc: { date: v.date, financial_account_id: v.accountId, method: v.method, reference: orNull(v.reference), client_request_id: v.requestId },
      p_lines: v.lines.filter((l) => /[1-9]/.test(l.amount)).map((l) => ({ payroll_item_id: l.itemId, amount: l.amount })),
    });
    if (error) throw error;
    return runId;
  });
}

export async function recordAdvanceAction(values: unknown): Promise<ActionResult<string>> {
  return runAction(["payroll.manage", "payroll.pay"], advanceSchema, values, async (v) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("record_advance", {
      p_doc: { employee_id: v.employeeId, date: v.date, amount: v.amount, financial_account_id: v.accountId, method: v.method, reference: orNull(v.reference), reason: orNull(v.reason), client_request_id: v.requestId },
    });
    if (error) throw error;
    return data;
  });
}

export async function postAdvanceAction(id: string): Promise<ActionResult<null>> {
  return runAction("payroll.pay", uuid, id, async (v) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("post_employee_advance", { p_id: v });
    if (error) throw error;
    return null;
  });
}

export async function deletePayrollDraftAction(table: "payroll_runs" | "employee_advances", id: string): Promise<ActionResult<null>> {
  const name = z.enum(["payroll_runs", "employee_advances"]).parse(table);
  return runAction("payroll.manage", uuid, id, async (v) => {
    const supabase = await createClient();
    const { data, error } = await supabase.from(name).delete().eq("id", v).eq("status", "draft").select("id");
    if (error) throw error;
    if (!data.length) throw Object.assign(new Error("The draft was not found or has already been processed"), { code: "P0002" });
    return null;
  });
}

export async function setSalaryAction(values: unknown): Promise<ActionResult<null>> {
  return runAction("payroll.manage", salarySchema, values, async (v) => {
    const supabase = await createClient();
    const { error } = await supabase.from("employee_salaries").upsert({ employee_id: v.employeeId, base_salary: orNull(v.salary) ?? "0" }, { onConflict: "employee_id" });
    if (error) throw error;
    return null;
  });
}
