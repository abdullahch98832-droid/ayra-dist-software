"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { toActionError, validationError } from "@/lib/actions";
import { authorize } from "@/lib/auth/session";
import { getSiteUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { inviteUserSchema, userStatusSchema } from "@/lib/validation/admin";

// Pattern: authorize on the server, change access in the database with the
// caller's own session (RLS and function checks apply again), then use the
// secret key only for Supabase Auth operations that have no database equivalent.

const BAN_FOREVER = "876000h";

export async function inviteUserAction(values: unknown): Promise<ActionResult> {
  try {
    await authorize("users.manage");
    const parsed = inviteUserSchema.safeParse(values);
    if (!parsed.success) return validationError(parsed.error);
    const { email, fullName, roleId, employeeId } = parsed.data;

    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName },
      redirectTo: `${await getSiteUrl()}/auth/confirm?next=/reset-password`,
    });
    if (error || !data.user) {
      return error?.code === "email_exists" || error?.status === 422 ? { ok: false, code: "duplicate" } : toActionError(error);
    }

    const supabase = await createClient();
    const assigned = await supabase.rpc("admin_assign_role", { p_user_id: data.user.id, p_role_id: roleId });
    const linked = employeeId && !assigned.error
      ? await supabase.rpc("admin_link_employee", { p_user_id: data.user.id, p_employee_id: employeeId })
      : { error: null };
    if (assigned.error || linked.error) {
      // Roll back the invitation so no account exists without the intended access.
      await admin.auth.admin.deleteUser(data.user.id);
      return toActionError(assigned.error ?? linked.error);
    }
    refresh();
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function assignRoleAction(userId: string, roleId: string): Promise<ActionResult> {
  try {
    await authorize("users.manage");
    const ids = z.object({ userId: z.uuid(), roleId: z.uuid() }).safeParse({ userId, roleId });
    if (!ids.success) return validationError(ids.error);
    const supabase = await createClient();
    const { error } = await supabase.rpc("admin_assign_role", { p_user_id: userId, p_role_id: roleId });
    if (error) return toActionError(error);
    refresh();
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function linkEmployeeAction(userId: string, employeeId: string): Promise<ActionResult> {
  try {
    await authorize("users.manage");
    const ids = z.object({ userId: z.uuid(), employeeId: z.union([z.uuid(), z.literal("")]) }).safeParse({ userId, employeeId });
    if (!ids.success) return validationError(ids.error);
    const supabase = await createClient();
    const { error } = await supabase.rpc("admin_link_employee", {
      p_user_id: userId,
      ...(employeeId ? { p_employee_id: employeeId } : {}),
    });
    if (error) return toActionError(error);
    refresh();
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

/** Returns data "authWarning" when the database changed but the Auth ban could not be updated. */
export async function setUserStatusAction(values: unknown): Promise<ActionResult<"authWarning">> {
  try {
    const ctx = await authorize("users.manage");
    const parsed = userStatusSchema.safeParse(values);
    if (!parsed.success) return validationError(parsed.error);
    const { userId, status, roleId } = parsed.data;
    if (userId === ctx.userId) return { ok: false, code: "rule", message: "You cannot change your own access" };

    const supabase = await createClient();
    const { error } = await supabase.rpc("admin_set_user_status", {
      p_user_id: userId,
      p_status: status,
      ...(roleId ? { p_role_id: roleId } : {}),
    });
    if (error) return toActionError(error);

    // The database already blocks all data access; the ban also stops sign-in and token refresh.
    const { error: banError } = await createAdminClient().auth.admin.updateUserById(userId, {
      ban_duration: status === "active" ? "none" : BAN_FOREVER,
    });
    refresh();
    return banError ? { ok: true, data: "authWarning" } : { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function sendPasswordResetAction(userId: string): Promise<ActionResult> {
  try {
    await authorize("users.manage");
    if (!z.uuid().safeParse(userId).success) return { ok: false, code: "notFound" };
    const { data, error } = await createAdminClient().auth.admin.getUserById(userId);
    if (error || !data.user.email) return toActionError(error ?? { code: "P0002" });
    const supabase = await createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(data.user.email, {
      redirectTo: `${await getSiteUrl()}/auth/confirm?next=/reset-password`,
    });
    if (resetError) return toActionError(resetError);
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}
