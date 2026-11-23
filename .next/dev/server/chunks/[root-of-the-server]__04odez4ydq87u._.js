module.exports = [
"[externals]/crypto [external] (crypto, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("crypto", () => require("crypto"));

module.exports = mod;
}),
"[externals]/next/dist/build/adapter/setup-node-env.external.js [external] (next/dist/build/adapter/setup-node-env.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/build/adapter/setup-node-env.external.js", () => require("next/dist/build/adapter/setup-node-env.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/@opentelemetry/api [external] (next/dist/compiled/@opentelemetry/api, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/compiled/@opentelemetry/api", () => require("next/dist/compiled/@opentelemetry/api"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/action-async-storage.external.js [external] (next/dist/server/app-render/action-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/action-async-storage.external.js", () => require("next/dist/server/app-render/action-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/after-task-async-storage.external.js [external] (next/dist/server/app-render/after-task-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/after-task-async-storage.external.js", () => require("next/dist/server/app-render/after-task-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/lib/incremental-cache/memory-cache.external.js [external] (next/dist/server/lib/incremental-cache/memory-cache.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/lib/incremental-cache/memory-cache.external.js", () => require("next/dist/server/lib/incremental-cache/memory-cache.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/lib/incremental-cache/shared-cache-controls.external.js [external] (next/dist/server/lib/incremental-cache/shared-cache-controls.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/lib/incremental-cache/shared-cache-controls.external.js", () => require("next/dist/server/lib/incremental-cache/shared-cache-controls.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/lib/incremental-cache/tags-manifest.external.js [external] (next/dist/server/lib/incremental-cache/tags-manifest.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/lib/incremental-cache/tags-manifest.external.js", () => require("next/dist/server/lib/incremental-cache/tags-manifest.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/lib/router-utils/instrumentation-globals.external.js [external] (next/dist/server/lib/router-utils/instrumentation-globals.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/lib/router-utils/instrumentation-globals.external.js", () => require("next/dist/server/lib/router-utils/instrumentation-globals.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/runtime-reacts.external.js [external] (next/dist/server/runtime-reacts.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/runtime-reacts.external.js", () => require("next/dist/server/runtime-reacts.external.js"));

module.exports = mod;
}),
"[externals]/node:async_hooks [external] (node:async_hooks, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("node:async_hooks", () => require("node:async_hooks"));

module.exports = mod;
}),
"[externals]/node:path [external] (node:path, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("node:path", () => require("node:path"));

module.exports = mod;
}),
"[externals]/node:stream [external] (node:stream, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("node:stream", () => require("node:stream"));

module.exports = mod;
}),
"[externals]/path [external] (path, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("path", () => require("path"));

module.exports = mod;
}),
"[project]/src/config/auth.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AUTH_CONFIG",
    ()=>AUTH_CONFIG
]);
const AUTH_CONFIG = {
    /** Sign out after this long without any request. */ idleTimeoutMinutes: 30,
    /** Sign out this long after sign-in, regardless of activity. */ absoluteTimeoutHours: 12,
    activityCookie: "ayra_last_activity",
    sessionStartCookie: "ayra_session_started",
    loginPath: "/login",
    homePath: "/dashboard",
    noAccessPath: "/no-access",
    /** Reachable without a session. */ publicPaths: [
        "/login",
        "/forgot-password",
        "/auth/confirm"
    ]
};
}),
"[project]/src/lib/auth/session-timeout.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "sessionTimeoutReason",
    ()=>sessionTimeoutReason
]);
function sessionTimeoutReason(now, lastActivity, startedAt, limits) {
    if (lastActivity > 0 && now - lastActivity > limits.idleMs) return "idle";
    if (startedAt > 0 && now - startedAt > limits.absoluteMs) return "expired";
    return null;
}
}),
"[project]/src/lib/supabase/env.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "getSupabasePublicEnv",
    ()=>getSupabasePublicEnv,
    "requireSupabasePublicEnv",
    ()=>requireSupabasePublicEnv
]);
function getSupabasePublicEnv() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !publishableKey) return null;
    return {
        url,
        publishableKey
    };
}
function requireSupabasePublicEnv() {
    const env = getSupabasePublicEnv();
    if (!env) {
        throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local (see .env.example).");
    }
    return env;
}
}),
"[project]/src/lib/supabase/middleware.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "updateSession",
    ()=>updateSession
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$ssr$2f$dist$2f$module$2f$createServerClient$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@supabase/ssr/dist/module/createServerClient.js [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$config$2f$auth$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/config/auth.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2f$session$2d$timeout$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/auth/session-timeout.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$supabase$2f$env$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/supabase/env.ts [middleware] (ecmascript)");
;
;
;
;
;
const IDLE_MS = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$config$2f$auth$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["AUTH_CONFIG"].idleTimeoutMinutes * 60_000;
const ABSOLUTE_MS = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$config$2f$auth$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["AUTH_CONFIG"].absoluteTimeoutHours * 3_600_000;
function isPublicPath(path) {
    return __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$config$2f$auth$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["AUTH_CONFIG"].publicPaths.some((p)=>path === p || path.startsWith(`${p}/`));
}
/** Redirect that keeps any auth cookies Supabase set on the pass-through response. */ function redirectTo(request, from, pathname, params = {}) {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    url.search = new URLSearchParams(params).toString();
    const res = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["NextResponse"].redirect(url);
    for (const cookie of from.cookies.getAll())res.cookies.set(cookie);
    return res;
}
async function updateSession(request) {
    let response = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["NextResponse"].next({
        request
    });
    // Allows the shell to run before a Supabase project is connected.
    const env = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$supabase$2f$env$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["getSupabasePublicEnv"])();
    if (!env) return response;
    const supabase = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$ssr$2f$dist$2f$module$2f$createServerClient$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["createServerClient"])(env.url, env.publishableKey, {
        cookies: {
            getAll () {
                return request.cookies.getAll();
            },
            setAll (cookiesToSet) {
                cookiesToSet.forEach(({ name, value })=>request.cookies.set(name, value));
                response = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["NextResponse"].next({
                    request
                });
                cookiesToSet.forEach(({ name, value, options })=>response.cookies.set(name, value, options));
            }
        }
    });
    const { data } = await supabase.auth.getClaims();
    const signedIn = !!data?.claims?.sub;
    const path = request.nextUrl.pathname;
    if (!signedIn) {
        if (isPublicPath(path)) return response;
        return redirectTo(request, response, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$config$2f$auth$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["AUTH_CONFIG"].loginPath, path === "/" ? {} : {
            next: path
        });
    }
    const now = Date.now();
    const lastActivity = Number(request.cookies.get(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$config$2f$auth$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["AUTH_CONFIG"].activityCookie)?.value);
    const startedAt = Number(request.cookies.get(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$config$2f$auth$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["AUTH_CONFIG"].sessionStartCookie)?.value);
    const reason = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2f$session$2d$timeout$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["sessionTimeoutReason"])(now, lastActivity, startedAt, {
        idleMs: IDLE_MS,
        absoluteMs: ABSOLUTE_MS
    });
    if (reason) {
        await supabase.auth.signOut();
        const res = redirectTo(request, response, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$config$2f$auth$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["AUTH_CONFIG"].loginPath, {
            reason
        });
        res.cookies.delete(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$config$2f$auth$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["AUTH_CONFIG"].activityCookie);
        res.cookies.delete(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$config$2f$auth$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["AUTH_CONFIG"].sessionStartCookie);
        return res;
    }
    // The cookies hold timestamps that are compared above; they must outlive the
    // timeouts, otherwise an idle user's cookie would simply expire and reset the clock.
    const cookieOptions = {
        httpOnly: true,
        sameSite: "lax",
        secure: ("TURBOPACK compile-time value", "development") === "production",
        path: "/",
        maxAge: 30 * 24 * 3600
    };
    const finalResponse = path === __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$config$2f$auth$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["AUTH_CONFIG"].loginPath || path === "/" ? redirectTo(request, response, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$config$2f$auth$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["AUTH_CONFIG"].homePath) : response;
    finalResponse.cookies.set(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$config$2f$auth$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["AUTH_CONFIG"].activityCookie, String(now), cookieOptions);
    if (!(startedAt > 0)) {
        finalResponse.cookies.set(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$config$2f$auth$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["AUTH_CONFIG"].sessionStartCookie, String(now), cookieOptions);
    }
    return finalResponse;
}
}),
"[project]/src/proxy.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "config",
    ()=>config,
    "proxy",
    ()=>proxy
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$supabase$2f$middleware$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/supabase/middleware.ts [middleware] (ecmascript)");
;
async function proxy(request) {
    return await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$supabase$2f$middleware$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["updateSession"])(request);
}
const config = {
    matcher: [
        "/((?!_next/static|_next/image|favicon.ico|branding|images|fonts|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"
    ]
};
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__04odez4ydq87u._.js.map