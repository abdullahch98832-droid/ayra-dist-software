"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_CONFIG } from "@/config/auth";
import { LOCALE_COOKIE, parseLocale } from "@/i18n/config";
import type { ActionResult } from "@/lib/action-result";
import { validationError } from "@/lib/actions";
import { safeNextPath } from "@/lib/safe-next-path";
import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import { forgotPasswordSchema, loginSchema, setPasswordSchema } from "@/lib/validation/auth";

const sessionCookie = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 30 * 24 * 3600,
};

/** Starts the idle/absolute timeout clocks for a new session. */
async function startSessionClock() {
  const store = await cookies();
  const now = String(Date.now());
  store.set(AUTH_CONFIG.activityCookie, now, sessionCookie);
  store.set(AUTH_CONFIG.sessionStartCookie, now, sessionCookie);
}

export async function signInAction(values: unknown, next?: string): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(values);
  if (!parsed.success) return validationError(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  // One message for every failure so the form does not reveal which accounts exist.
  if (error || !data.user) return { ok: false, code: "rule", message: "invalidCredentials" };

  await startSessionClock();
  const { data: profile } = await supabase.from("profiles").select("locale").eq("id", data.user.id).maybeSingle();
  if (profile) {
    (await cookies()).set(LOCALE_COOKIE, parseLocale(profile.locale), { path: "/", maxAge: 365 * 24 * 3600, sameSite: "lax" });
  }
  redirect(safeNextPath(next, AUTH_CONFIG.homePath));
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const store = await cookies();
  store.delete(AUTH_CONFIG.activityCookie);
  store.delete(AUTH_CONFIG.sessionStartCookie);
  redirect(AUTH_CONFIG.loginPath);
}

export async function requestPasswordResetAction(values: unknown): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse(values);
  if (!parsed.success) return validationError(parsed.error);
  const supabase = await createClient();
  // The result is ignored on purpose: the response must not reveal whether the email exists.
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await getSiteUrl()}/auth/confirm?next=/reset-password`,
  });
  return { ok: true };
}

export async function setPasswordAction(values: unknown): Promise<ActionResult> {
  const parsed = setPasswordSchema.safeParse(values);
  if (!parsed.success) return validationError(parsed.error);
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return { ok: false, code: "rule", message: "linkInvalid" };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, code: "rule", message: error.message };
  redirect(AUTH_CONFIG.homePath);
}
