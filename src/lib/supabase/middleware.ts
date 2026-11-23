import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { AUTH_CONFIG } from "@/config/auth";
import { sessionTimeoutReason } from "@/lib/auth/session-timeout";
import { getSupabasePublicEnv } from "./env";

const IDLE_MS = AUTH_CONFIG.idleTimeoutMinutes * 60_000;
const ABSOLUTE_MS = AUTH_CONFIG.absoluteTimeoutHours * 3_600_000;

function isPublicPath(path: string) {
  return AUTH_CONFIG.publicPaths.some((p) => path === p || path.startsWith(`${p}/`));
}

/** Redirect that keeps any auth cookies Supabase set on the pass-through response. */
function redirectTo(request: NextRequest, from: NextResponse, pathname: string, params: Record<string, string> = {}) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = new URLSearchParams(params).toString();
  const res = NextResponse.redirect(url);
  for (const cookie of from.cookies.getAll()) res.cookies.set(cookie);
  return res;
}

/**
 * Runs on every request: refreshes the Supabase session, sends signed-out users
 * to the login page and enforces the idle and absolute session timeouts.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Allows the shell to run before a Supabase project is connected.
  const env = getSupabasePublicEnv();
  if (!env) return response;

  const supabase = createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const signedIn = !!data?.claims?.sub;
  const path = request.nextUrl.pathname;

  if (!signedIn) {
    if (isPublicPath(path)) return response;
    return redirectTo(request, response, AUTH_CONFIG.loginPath, path === "/" ? {} : { next: path });
  }

  const now = Date.now();
  const lastActivity = Number(request.cookies.get(AUTH_CONFIG.activityCookie)?.value);
  const startedAt = Number(request.cookies.get(AUTH_CONFIG.sessionStartCookie)?.value);
  const reason = sessionTimeoutReason(now, lastActivity, startedAt, { idleMs: IDLE_MS, absoluteMs: ABSOLUTE_MS });

  if (reason) {
    await supabase.auth.signOut();
    const res = redirectTo(request, response, AUTH_CONFIG.loginPath, { reason });
    res.cookies.delete(AUTH_CONFIG.activityCookie);
    res.cookies.delete(AUTH_CONFIG.sessionStartCookie);
    return res;
  }

  // The cookies hold timestamps that are compared above; they must outlive the
  // timeouts, otherwise an idle user's cookie would simply expire and reset the clock.
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 30 * 24 * 3600,
  };
  const finalResponse =
    path === AUTH_CONFIG.loginPath || path === "/"
      ? redirectTo(request, response, AUTH_CONFIG.homePath)
      : response;
  finalResponse.cookies.set(AUTH_CONFIG.activityCookie, String(now), cookieOptions);
  if (!(startedAt > 0)) {
    finalResponse.cookies.set(AUTH_CONFIG.sessionStartCookie, String(now), cookieOptions);
  }
  return finalResponse;
}
