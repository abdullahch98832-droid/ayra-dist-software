"use client";

import { useEffect, useState } from "react";
import { APP_CONFIG } from "@/config/app";
import { LOCALE_COOKIE, parseLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n";
import { LOCALES, type Locale } from "@/types";

function readLocale(): Locale {
  if (typeof document === "undefined") return "en";
  return parseLocale(document.cookie.split("; ").find((c) => c.startsWith(`${LOCALE_COOKIE}=`))?.split("=")[1]);
}

/** Replaces the root layout when it fails, so it cannot rely on the stylesheet or providers. */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const [locale] = useState(readLocale);
  const t = getDictionary(locale);
  useEffect(() => console.error(error), [error]);
  return (
    <html lang={locale} dir={LOCALES[locale].direction}>
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#f5f7fa", color: "#16233b", fontFamily: "system-ui, sans-serif", textAlign: "center" }}>
        <title>{t.states.errorTitle}</title>
        <div style={{ maxWidth: 440 }}>
          <p dir="ltr" style={{ color: "#14284f", letterSpacing: "0.08em" }}>{APP_CONFIG.name}</p>
          <h1 style={{ fontSize: 20, color: "#14284f" }}>{t.states.errorTitle}</h1>
          <p style={{ color: "#55627a", lineHeight: 1.8 }}>{t.states.errorHint}</p>
          <button onClick={() => retry()} style={{ padding: "10px 20px", border: 0, borderRadius: 10, background: "#1f56c9", color: "#fff", font: "inherit", cursor: "pointer" }}>
            {t.common.retry}
          </button>
        </div>
      </body>
    </html>
  );
}
