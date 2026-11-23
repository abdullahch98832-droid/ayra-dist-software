"use server";

import { randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { toActionError, validationError } from "@/lib/actions";
import { authorize, can } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PHOTO_MAX_BYTES, PHOTO_TYPES, employeeSchema } from "@/lib/validation/employees";

const nullIfEmpty = (v: string) => (v.trim() === "" ? null : v.trim());

export async function saveEmployeeAction(employeeId: string | null, values: unknown): Promise<ActionResult<string>> {
  try {
    const ctx = await authorize("employees.manage");
    const parsed = employeeSchema.safeParse(values);
    if (!parsed.success) return validationError(parsed.error);
    if (employeeId !== null && !z.uuid().safeParse(employeeId).success) return { ok: false, code: "notFound" };
    const v = parsed.data;

    // Salary is confidential: only payroll managers may set it (the database enforces this too).
    if (v.salary !== "" && !can(ctx, "payroll.manage")) return { ok: false, code: "permissionDenied" };

    const record = {
      full_name: v.fullName.trim(),
      full_name_ur: nullIfEmpty(v.fullNameUr),
      father_name: nullIfEmpty(v.fatherName),
      cnic: nullIfEmpty(v.cnic),
      phone: nullIfEmpty(v.phone),
      whatsapp: nullIfEmpty(v.whatsapp),
      email: nullIfEmpty(v.email),
      address: nullIfEmpty(v.address),
      department: nullIfEmpty(v.department),
      job_title: nullIfEmpty(v.jobTitle),
      hire_date: nullIfEmpty(v.hireDate),
      status: v.status,
      emergency_contact: nullIfEmpty(v.emergencyContact),
      notes: nullIfEmpty(v.notes),
    };

    const supabase = await createClient();
    let id = employeeId;
    if (id) {
      const { data, error } = await supabase
        .from("employees")
        .update({ ...record, ...(v.employeeCode.trim() ? { employee_code: v.employeeCode.trim() } : {}) })
        .eq("id", id)
        .select("id");
      if (error) return toActionError(error);
      if (!data.length) return { ok: false, code: "notFound" };
    } else {
      const { data, error } = await supabase
        .from("employees")
        .insert({ ...record, employee_code: v.employeeCode.trim() })
        .select("id")
        .single();
      if (error) return toActionError(error);
      id = data.id;
    }

    if (v.salary !== "") {
      const { error } = await supabase
        .from("employee_salaries")
        .upsert({ employee_id: id, base_salary: v.salary }, { onConflict: "employee_id" });
      if (error) return toActionError(error);
    }
    refresh();
    return { ok: true, data: id };
  } catch (error) {
    return toActionError(error);
  }
}

export async function uploadEmployeePhotoAction(formData: FormData): Promise<ActionResult> {
  try {
    await authorize("employees.manage");
    const employeeId = String(formData.get("employeeId") ?? "");
    const file = formData.get("photo");
    if (!z.uuid().safeParse(employeeId).success) return { ok: false, code: "notFound" };
    if (!(file instanceof File) || file.size === 0) return { ok: false, code: "validation", fieldErrors: { photo: ["required"] } };
    const ext = PHOTO_TYPES[file.type];
    if (!ext) return { ok: false, code: "validation", fieldErrors: { photo: ["fileType"] } };
    if (file.size > PHOTO_MAX_BYTES) return { ok: false, code: "validation", fieldErrors: { photo: ["fileTooLarge"] } };

    const supabase = await createClient();
    const { data: existing, error: readError } = await supabase
      .from("employees").select("photo_path").eq("id", employeeId).maybeSingle();
    if (readError) return toActionError(readError);
    if (!existing) return { ok: false, code: "notFound" };

    const path = `${employeeId}/${randomUUID()}.${ext}`;
    const upload = await supabase.storage.from("employee-photos").upload(path, file, { contentType: file.type, upsert: false });
    if (upload.error) return { ok: false, code: "rule", message: upload.error.message };

    const { error } = await supabase.from("employees").update({ photo_path: path }).eq("id", employeeId);
    if (error) {
      await supabase.storage.from("employee-photos").remove([path]);
      return toActionError(error);
    }
    if (existing.photo_path) await supabase.storage.from("employee-photos").remove([existing.photo_path]);
    refresh();
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}
