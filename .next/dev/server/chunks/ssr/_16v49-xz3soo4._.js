module.exports = [
"[project]/.next-internal/server/app/(auth)/login/page/actions.js { ACTIONS_MODULE0 => \"[project]/src/app/actions/locale.ts [app-rsc] (ecmascript)\", ACTIONS_MODULE1 => \"[project]/src/app/(auth)/actions.ts [app-rsc] (ecmascript)\" } [app-rsc] (server actions loader, ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "40a74affb53f216fb04eed0bc8332a43a23e91f2bc",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$actions$2f$locale$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["setLocaleAction"],
    "6000c9c9771081b724251cb7670e5213ffaf5065a3",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$auth$292f$actions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["signInAction"]
]);
var __TURBOPACK__imported__module__$5b$project$5d2f2e$next$2d$internal$2f$server$2f$app$2f28$auth$292f$login$2f$page$2f$actions$2e$js__$7b$__ACTIONS_MODULE0__$3d3e$__$225b$project$5d2f$src$2f$app$2f$actions$2f$locale$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29222c$__ACTIONS_MODULE1__$3d3e$__$225b$project$5d2f$src$2f$app$2f28$auth$292f$actions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$2922$__$7d$__$5b$app$2d$rsc$5d$__$28$server__actions__loader$2c$__ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i('[project]/.next-internal/server/app/(auth)/login/page/actions.js { ACTIONS_MODULE0 => "[project]/src/app/actions/locale.ts [app-rsc] (ecmascript)", ACTIONS_MODULE1 => "[project]/src/app/(auth)/actions.ts [app-rsc] (ecmascript)" } [app-rsc] (server actions loader, ecmascript) <locals>');
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$actions$2f$locale$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/app/actions/locale.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$auth$292f$actions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/app/(auth)/actions.ts [app-rsc] (ecmascript)");
}),
"[project]/.next-internal/server/app/(auth)/login/page/actions.js { ACTIONS_MODULE0 => \"[project]/src/app/actions/locale.ts [app-rsc] (ecmascript)\", ACTIONS_MODULE1 => \"[project]/src/app/(auth)/actions.ts [app-rsc] (ecmascript)\" } [app-rsc] (server actions loader, ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$actions$2f$locale$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/app/actions/locale.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f28$auth$292f$actions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/app/(auth)/actions.ts [app-rsc] (ecmascript)");
;
;
}),
"[project]/src/app/(auth)/actions.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/* __next_internal_action_entry_do_not_use__ [{"0036cfb5cdc92b8b55edbf12379a8a224ed0ef466f":{"name":"signOutAction"},"400322a75cc80891974e05fafff558d288f10bd369":{"name":"setPasswordAction"},"40fb8192380cd01aac1ca4555543f64581adb9bd7a":{"name":"requestPasswordResetAction"},"6000c9c9771081b724251cb7670e5213ffaf5065a3":{"name":"signInAction"}},"src/app/(auth)/actions.ts",""] */ __turbopack_context__.s([
    "requestPasswordResetAction",
    ()=>requestPasswordResetAction,
    "setPasswordAction",
    ()=>setPasswordAction,
    "signInAction",
    ()=>signInAction,
    "signOutAction",
    ()=>signOutAction
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/build/webpack/loaders/next-flight-loader/server-reference.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/headers.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$api$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/next/dist/api/navigation.react-server.js [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$components$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/components/navigation.react-server.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$config$2f$auth$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/config/auth.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$i18n$2f$config$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/i18n/config.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$actions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/actions.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$safe$2d$next$2d$path$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/safe-next-path.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$site$2d$url$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/site-url.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$supabase$2f$server$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/supabase/server.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$validation$2f$auth$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/validation/auth.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$validate$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/build/webpack/loaders/next-flight-loader/action-validate.js [app-rsc] (ecmascript)");
;
;
;
;
;
;
;
;
;
;
const sessionCookie = {
    httpOnly: true,
    sameSite: "lax",
    secure: ("TURBOPACK compile-time value", "development") === "production",
    path: "/",
    maxAge: 30 * 24 * 3600
};
/** Starts the idle/absolute timeout clocks for a new session. */ async function startSessionClock() {
    const store = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["cookies"])();
    const now = String(Date.now());
    store.set(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$config$2f$auth$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["AUTH_CONFIG"].activityCookie, now, sessionCookie);
    store.set(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$config$2f$auth$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["AUTH_CONFIG"].sessionStartCookie, now, sessionCookie);
}
async function signInAction(values, next) {
    const parsed = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$validation$2f$auth$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["loginSchema"].safeParse(values);
    if (!parsed.success) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$actions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["validationError"])(parsed.error);
    const supabase = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$supabase$2f$server$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["createClient"])();
    const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
    // One message for every failure so the form does not reveal which accounts exist.
    if (error || !data.user) return {
        ok: false,
        code: "rule",
        message: "invalidCredentials"
    };
    await startSessionClock();
    const { data: profile } = await supabase.from("profiles").select("locale").eq("id", data.user.id).maybeSingle();
    if (profile) {
        (await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["cookies"])()).set(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$i18n$2f$config$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["LOCALE_COOKIE"], (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$i18n$2f$config$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["parseLocale"])(profile.locale), {
            path: "/",
            maxAge: 365 * 24 * 3600,
            sameSite: "lax"
        });
    }
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$components$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["redirect"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$safe$2d$next$2d$path$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["safeNextPath"])(next, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$config$2f$auth$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["AUTH_CONFIG"].homePath));
}
async function signOutAction() {
    const supabase = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$supabase$2f$server$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["createClient"])();
    await supabase.auth.signOut();
    const store = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["cookies"])();
    store.delete(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$config$2f$auth$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["AUTH_CONFIG"].activityCookie);
    store.delete(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$config$2f$auth$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["AUTH_CONFIG"].sessionStartCookie);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$components$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["redirect"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$config$2f$auth$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["AUTH_CONFIG"].loginPath);
}
async function requestPasswordResetAction(values) {
    const parsed = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$validation$2f$auth$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["forgotPasswordSchema"].safeParse(values);
    if (!parsed.success) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$actions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["validationError"])(parsed.error);
    const supabase = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$supabase$2f$server$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["createClient"])();
    // The result is ignored on purpose: the response must not reveal whether the email exists.
    await supabase.auth.resetPasswordForEmail(parsed.data.email, {
        redirectTo: `${await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$site$2d$url$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getSiteUrl"])()}/auth/confirm?next=/reset-password`
    });
    return {
        ok: true
    };
}
async function setPasswordAction(values) {
    const parsed = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$validation$2f$auth$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["setPasswordSchema"].safeParse(values);
    if (!parsed.success) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$actions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["validationError"])(parsed.error);
    const supabase = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$supabase$2f$server$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["createClient"])();
    const { data } = await supabase.auth.getClaims();
    if (!data?.claims?.sub) return {
        ok: false,
        code: "rule",
        message: "linkInvalid"
    };
    const { error } = await supabase.auth.updateUser({
        password: parsed.data.password
    });
    if (error) return {
        ok: false,
        code: "rule",
        message: error.message
    };
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$components$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["redirect"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$config$2f$auth$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["AUTH_CONFIG"].homePath);
}
;
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$validate$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["ensureServerEntryExports"])([
    signInAction,
    signOutAction,
    requestPasswordResetAction,
    setPasswordAction
]);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(signInAction, "6000c9c9771081b724251cb7670e5213ffaf5065a3", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(signOutAction, "0036cfb5cdc92b8b55edbf12379a8a224ed0ef466f", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(requestPasswordResetAction, "40fb8192380cd01aac1ca4555543f64581adb9bd7a", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(setPasswordAction, "400322a75cc80891974e05fafff558d288f10bd369", null);
}),
"[project]/src/app/actions/locale.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/* __next_internal_action_entry_do_not_use__ [{"40a74affb53f216fb04eed0bc8332a43a23e91f2bc":{"name":"setLocaleAction"}},"src/app/actions/locale.ts",""] */ __turbopack_context__.s([
    "setLocaleAction",
    ()=>setLocaleAction
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/build/webpack/loaders/next-flight-loader/server-reference.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/headers.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/cache.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$i18n$2f$config$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/i18n/config.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2f$session$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/auth/session.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$supabase$2f$server$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/supabase/server.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$validate$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/build/webpack/loaders/next-flight-loader/action-validate.js [app-rsc] (ecmascript)");
;
;
;
;
;
;
async function setLocaleAction(requested) {
    const locale = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$i18n$2f$config$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["parseLocale"])(requested);
    (await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["cookies"])()).set(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$i18n$2f$config$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["LOCALE_COOKIE"], locale, {
        path: "/",
        maxAge: 365 * 24 * 3600,
        sameSite: "lax"
    });
    const ctx = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2f$session$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getSessionContext"])();
    if (ctx) {
        const supabase = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$supabase$2f$server$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["createClient"])();
        await supabase.from("profiles").update({
            locale
        }).eq("id", ctx.userId);
    }
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["refresh"])();
}
;
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$validate$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["ensureServerEntryExports"])([
    setLocaleAction
]);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(setLocaleAction, "40a74affb53f216fb04eed0bc8332a43a23e91f2bc", null);
}),
"[project]/src/config/auth.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
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
"[project]/src/lib/actions.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "toActionError",
    ()=>toActionError,
    "validationError",
    ()=>validationError
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2f$session$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/auth/session.ts [app-rsc] (ecmascript)");
;
;
function toActionError(error) {
    if (error instanceof __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2f$session$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["AuthorizationError"]) return {
        ok: false,
        code: "permissionDenied"
    };
    const e = error ?? {};
    switch(e.code){
        case "42501":
            return {
                ok: false,
                code: "permissionDenied"
            };
        case "23505":
            return {
                ok: false,
                code: "duplicate"
            };
        case "P0002":
            return {
                ok: false,
                code: "notFound",
                message: e.message
            };
        case "23514":
        case "22023":
        case "23503":
        case "P0001":
            return {
                ok: false,
                code: "rule",
                message: e.message
            };
        default:
            console.error(error);
            return {
                ok: false,
                code: "unexpected"
            };
    }
}
function validationError(error) {
    const fieldErrors = {};
    for (const issue of error.issues){
        const key = issue.path.join(".") || "_";
        (fieldErrors[key] ??= []).push(issue.message);
    }
    return {
        ok: false,
        code: "validation",
        fieldErrors
    };
}
}),
"[project]/src/lib/auth/permissions.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// Mirrors public.permissions (a database test keeps the two in sync).
__turbopack_context__.s([
    "PERMISSIONS",
    ()=>PERMISSIONS,
    "PERMISSION_MODULES",
    ()=>PERMISSION_MODULES,
    "isPermission",
    ()=>isPermission
]);
const PERMISSIONS = [
    "dashboard.view",
    "users.view",
    "users.manage",
    "employees.view",
    "employees.manage",
    "products.view",
    "products.manage",
    "warehouses.view",
    "warehouses.manage",
    "inventory.view",
    "inventory.adjust",
    "inventory.transfer",
    "inventory.count",
    "purchasing.view",
    "purchasing.create",
    "purchasing.approve",
    "purchasing.post",
    "suppliers.view",
    "suppliers.manage",
    "payables.view",
    "payables.pay",
    "company.view",
    "company.pay",
    "customers.view",
    "customers.manage",
    "sales.view",
    "sales.view_all",
    "sales.create",
    "sales.approve",
    "sales.credit_override",
    "sales.dispatch",
    "sales.invoice",
    "sales.return",
    "receivables.view",
    "receivables.collect",
    "receivables.post",
    "sol.view",
    "sol.manage",
    "sol.post",
    "vehicles.view",
    "vehicles.manage",
    "expenses.view",
    "expenses.create",
    "expenses.post",
    "payroll.view",
    "payroll.manage",
    "payroll.post",
    "payroll.pay",
    "cash_bank.view",
    "cash_bank.manage",
    "cash_bank.transfer",
    "accounting.view",
    "accounting.journal",
    "accounting.manage",
    "costs.view",
    "reports.view",
    "reports.financial",
    "audit.view",
    "settings.manage"
];
function isPermission(value) {
    return PERMISSIONS.includes(value);
}
const PERMISSION_MODULES = [
    "dashboard",
    "inventory",
    "products",
    "warehouses",
    "purchasing",
    "sales",
    "customers",
    "receivables",
    "suppliers",
    "payables",
    "company",
    "sol",
    "vehicles",
    "expenses",
    "salaries",
    "cash_bank",
    "accounting",
    "costs",
    "reports",
    "employees",
    "users",
    "audit",
    "settings"
];
}),
"[project]/src/lib/auth/session.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AuthorizationError",
    ()=>AuthorizationError,
    "authorize",
    ()=>authorize,
    "can",
    ()=>can,
    "getSessionContext",
    ()=>getSessionContext,
    "requireActiveSession",
    ()=>requireActiveSession
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$api$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/next/dist/api/navigation.react-server.js [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$components$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/components/navigation.react-server.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$config$2f$auth$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/config/auth.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$supabase$2f$server$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/supabase/server.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$supabase$2f$env$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/supabase/env.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2f$permissions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/auth/permissions.ts [app-rsc] (ecmascript)");
;
;
;
;
;
;
;
const getSessionContext = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["cache"])(async ()=>{
    if (!(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$supabase$2f$env$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getSupabasePublicEnv"])()) return null;
    const supabase = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$supabase$2f$server$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["createClient"])();
    const { data: claimsData } = await supabase.auth.getClaims();
    const claims = claimsData?.claims;
    if (!claims?.sub) return null;
    const [{ data: profile }, { data: permissions }] = await Promise.all([
        supabase.from("profiles").select("full_name, is_active, removed_at, employee_id, role:roles(id, code, name_en, name_ur)").eq("id", claims.sub).maybeSingle(),
        supabase.rpc("my_permissions")
    ]);
    if (!profile) return null;
    return {
        userId: claims.sub,
        email: typeof claims.email === "string" ? claims.email : "",
        fullName: profile.full_name,
        isActive: profile.is_active,
        removed: profile.removed_at !== null,
        employeeId: profile.employee_id,
        role: profile.role ? {
            id: profile.role.id,
            code: profile.role.code,
            nameEn: profile.role.name_en,
            nameUr: profile.role.name_ur
        } : null,
        permissions: new Set((permissions ?? []).filter(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2f$permissions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["isPermission"]))
    };
});
async function requireActiveSession() {
    const ctx = await getSessionContext();
    if (!ctx) (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$components$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["redirect"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$config$2f$auth$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["AUTH_CONFIG"].loginPath);
    if (!ctx.isActive || !ctx.role) (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$components$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["redirect"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$config$2f$auth$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["AUTH_CONFIG"].noAccessPath);
    return ctx;
}
function can(ctx, permission) {
    return !!ctx && ctx.isActive && ctx.permissions.has(permission);
}
class AuthorizationError extends Error {
    permission;
    constructor(permission){
        super(`Permission denied: ${permission}`), this.permission = permission;
    }
}
async function authorize(permission) {
    const ctx = await getSessionContext();
    if (!can(ctx, permission)) throw new AuthorizationError(permission);
    return ctx;
}
}),
"[project]/src/lib/safe-next-path.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/** Only same-site relative paths are accepted as post-login destinations (prevents open redirects). */ __turbopack_context__.s([
    "safeNextPath",
    ()=>safeNextPath
]);
function safeNextPath(value, fallback) {
    if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
    return value;
}
}),
"[project]/src/lib/site-url.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "getSiteUrl",
    ()=>getSiteUrl
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/headers.js [app-rsc] (ecmascript)");
;
;
async function getSiteUrl() {
    const configured = process.env.NEXT_PUBLIC_SITE_URL;
    if (configured) return configured.replace(/\/$/, "");
    const h = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["headers"])();
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
    const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    return `${proto}://${host}`;
}
}),
"[project]/src/lib/supabase/env.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
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
"[project]/src/lib/supabase/server.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "createClient",
    ()=>createClient
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$ssr$2f$dist$2f$module$2f$createServerClient$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@supabase/ssr/dist/module/createServerClient.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/headers.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$supabase$2f$env$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/supabase/env.ts [app-rsc] (ecmascript)");
;
;
;
async function createClient() {
    const { url, publishableKey } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$supabase$2f$env$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["requireSupabasePublicEnv"])();
    const cookieStore = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["cookies"])();
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$ssr$2f$dist$2f$module$2f$createServerClient$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["createServerClient"])(url, publishableKey, {
        cookies: {
            getAll () {
                return cookieStore.getAll();
            },
            setAll (cookiesToSet) {
                try {
                    cookiesToSet.forEach(({ name, value, options })=>cookieStore.set(name, value, options));
                } catch  {
                // Server Components cannot set cookies; the proxy refreshes the session instead.
                }
            }
        }
    });
}
}),
"[project]/src/lib/validation/auth.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "forgotPasswordSchema",
    ()=>forgotPasswordSchema,
    "loginSchema",
    ()=>loginSchema,
    "setPasswordSchema",
    ()=>setPasswordSchema
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__ = __turbopack_context__.i("[project]/node_modules/zod/v4/classic/external.js [app-rsc] (ecmascript) <export * as z .object>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$email$3e$__ = __turbopack_context__.i("[project]/node_modules/zod/v4/classic/external.js [app-rsc] (ecmascript) <export * as z .email>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__ = __turbopack_context__.i("[project]/node_modules/zod/v4/classic/external.js [app-rsc] (ecmascript) <export * as z .string>");
;
const loginSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    email: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$email$3e$__["z"].email("invalidEmail"),
    password: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().min(1, "required")
});
const forgotPasswordSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    email: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$email$3e$__["z"].email("invalidEmail")
});
const setPasswordSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    password: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().min(10, "passwordTooShort").max(128, "tooLong"),
    confirm: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string()
}).refine((v)=>v.password === v.confirm, {
    message: "passwordsDontMatch",
    path: [
        "confirm"
    ]
});
}),
];

//# sourceMappingURL=_16v49-xz3soo4._.js.map