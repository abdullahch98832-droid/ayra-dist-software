import type { EmailOtpType } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { AUTH_CONFIG } from "@/config/auth";
import { safeNextPath } from "@/lib/safe-next-path";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_TYPES: EmailOtpType[] = ["invite", "recovery", "email", "email_change"];

/** Target of invitation and password-reset email links (token_hash flow). */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;

  if (tokenHash && type && ALLOWED_TYPES.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      const store = await cookies();
      const now = String(Date.now());
      const options = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 30 * 24 * 3600 };
      store.set(AUTH_CONFIG.activityCookie, now, options);
      store.set(AUTH_CONFIG.sessionStartCookie, now, options);
      // Invited users and password resets both go on to choose a password.
      redirect(safeNextPath(params.get("next"), "/reset-password"));
    }
  }
  redirect(`${AUTH_CONFIG.loginPath}?error=link`);
}
