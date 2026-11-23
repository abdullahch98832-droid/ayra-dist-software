"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { toActionError, validationError } from "@/lib/actions";
import { authorize } from "@/lib/auth/session";
import { isPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { roleSchema } from "@/lib/validation/admin";

export async function createRoleAction(values: unknown): Promise<ActionResult<string>> {
  try {
    await authorize("users.manage");
    const parsed = roleSchema.safeParse(values);
    if (!parsed.success) return validationError(parsed.error);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("roles")
      .insert({
        code: parsed.data.code,
        name_en: parsed.data.nameEn,
        name_ur: parsed.data.nameUr,
        description: parsed.data.description || null,
      })
      .select("id")
      .single();
    if (error) return toActionError(error);
    refresh();
    return { ok: true, data: data.id };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateRoleAction(roleId: string, values: unknown): Promise<ActionResult> {
  try {
    await authorize("users.manage");
    const parsed = roleSchema.safeParse(values);
    if (!parsed.success || !z.uuid().safeParse(roleId).success) return validationError(parsed.error ?? new z.ZodError([]));
    const supabase = await createClient();
    // RLS only allows updates to custom roles; zero rows means a system role.
    const { data, error } = await supabase
      .from("roles")
      .update({ name_en: parsed.data.nameEn, name_ur: parsed.data.nameUr, description: parsed.data.description || null })
      .eq("id", roleId)
      .select("id");
    if (error) return toActionError(error);
    if (!data.length) return { ok: false, code: "permissionDenied" };
    refresh();
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteRoleAction(roleId: string): Promise<ActionResult> {
  try {
    await authorize("users.manage");
    const supabase = await createClient();
    const { data, error } = await supabase.from("roles").delete().eq("id", roleId).select("id");
    if (error) return toActionError(error);
    if (!data.length) return { ok: false, code: "permissionDenied" };
    refresh();
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function setRolePermissionAction(roleId: string, permission: string, enabled: boolean): Promise<ActionResult> {
  try {
    await authorize("users.manage");
    if (!isPermission(permission) || !z.uuid().safeParse(roleId).success) return { ok: false, code: "notFound" };
    const supabase = await createClient();
    const { error } = enabled
      ? await supabase.from("role_permissions").upsert({ role_id: roleId, permission_code: permission }, { ignoreDuplicates: true })
      : await supabase.from("role_permissions").delete().eq("role_id", roleId).eq("permission_code", permission);
    if (error) return toActionError(error);
    refresh();
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}
