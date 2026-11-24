import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { AUTH_CONFIG } from "@/config/auth";
import { createClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { isPermission, type Permission } from "./permissions";

export interface SessionContext {
  userId: string;
  email: string;
  fullName: string;
  isActive: boolean;
  removed: boolean;
  employeeId: string | null;
  role: { id: string; code: string; nameEn: string; nameUr: string } | null;
  permissions: ReadonlySet<Permission>;
}

/** Signed-in user, profile and permissions, loaded once per request. */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  if (!getSupabasePublicEnv()) return null;
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (!claims?.sub) return null;

  const [profileResult, permissionsResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, is_active, removed_at, employee_id, role:roles(id, code, name_en, name_ur)")
      .eq("id", claims.sub)
      .maybeSingle(),
    supabase.rpc("my_permissions"),
  ]);
  // A failed read is not "signed out": sending the user to the login page would bounce them
  // straight back here, because the proxy still sees a valid session.
  if (profileResult.error) throw profileResult.error;
  if (permissionsResult.error) throw permissionsResult.error;

  const email = typeof claims.email === "string" ? claims.email : "";
  const profile = profileResult.data;
  if (!profile) {
    // Signed in without a profile row: no access, like an account without a role.
    return {
      userId: claims.sub, email, fullName: "", isActive: true, removed: false, employeeId: null, role: null,
      permissions: new Set(),
    };
  }

  return {
    userId: claims.sub,
    email,
    fullName: profile.full_name,
    isActive: profile.is_active,
    removed: profile.removed_at !== null,
    employeeId: profile.employee_id,
    role: profile.role
      ? { id: profile.role.id, code: profile.role.code, nameEn: profile.role.name_en, nameUr: profile.role.name_ur }
      : null,
    permissions: new Set((permissionsResult.data ?? []).filter(isPermission)),
  };
});

/** For pages: a signed-in, active user with a role, or a redirect. */
export async function requireActiveSession(): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) redirect(AUTH_CONFIG.loginPath);
  if (!ctx.isActive || !ctx.role) redirect(AUTH_CONFIG.noAccessPath);
  return ctx;
}

export function can(ctx: SessionContext | null, permission: Permission): boolean {
  return !!ctx && ctx.isActive && ctx.permissions.has(permission);
}

export class AuthorizationError extends Error {
  constructor(public readonly permission: Permission) {
    super(`Permission denied: ${permission}`);
  }
}

/**
 * For server actions: verifies the caller holds a permission before any work.
 * The database enforces the same rule again through RLS and function checks.
 */
export async function authorize(permission: Permission): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!can(ctx, permission)) throw new AuthorizationError(permission);
  return ctx!;
}
