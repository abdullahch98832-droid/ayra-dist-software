"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import type { Locale } from "@/types";
import { LOCALE_COOKIE, parseLocale } from "@/i18n/config";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export async function setLocaleAction(requested: Locale) {
  const locale = parseLocale(requested);
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 365 * 24 * 3600, sameSite: "lax" });
  // The cookie is what matters; saving the preference must not block the switch.
  const ctx = await getSessionContext().catch(() => null);
  if (ctx) {
    const supabase = await createClient();
    await supabase.from("profiles").update({ locale }).eq("id", ctx.userId);
  }
  refresh();
}
