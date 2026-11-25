import type { NextRequest } from "next/server";
import { reportCsv, reportXlsx } from "@/features/reports/export";
import { loadReport, recordExport } from "@/features/reports/load";
import { getLocale } from "@/i18n/server";
import { getSessionContext } from "@/lib/auth/session";
import { databaseUpdateNeeded } from "@/lib/supabase/schema-state";

const OUTDATED = new Set(["PGRST202", "42883"]);
const TYPES = { csv: "text/csv; charset=utf-8", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } as const;
const refuse = (status: number, code: string) => Response.json({ code }, { status, headers: { "Cache-Control": "private, no-store" } });

/** Excel or CSV of a report. Session, permission and report are checked here; the database checks again. */
export async function GET(request: NextRequest, { params }: RouteContext<"/reports/[slug]/export">) {
  const query = Object.fromEntries(request.nextUrl.searchParams);
  const format = query.format === "csv" || query.format === "xlsx" ? query.format : null;
  if (!format) return refuse(400, "format");
  const ctx = await getSessionContext();
  if (!ctx) return refuse(401, "unauthorized");
  if (!ctx.isActive || !ctx.role) return refuse(403, "forbidden");
  const { slug } = await params;
  try {
    const report = await loadReport(slug, ctx, query, true);
    if (report === "notFound") return refuse(404, "notFound");
    if (report === "forbidden") return refuse(403, "forbidden");
    await recordExport(report, format);
    const locale = query.lang === "en" || query.lang === "ur" ? query.lang : await getLocale();
    const file = format === "csv" ? reportCsv(report, locale) : reportXlsx(report, locale, ctx.fullName || ctx.email, new Date());
    return new Response("content" in file ? file.content : new Uint8Array(file.bytes), {
      headers: { "Content-Type": TYPES[format], "Content-Disposition": `attachment; filename="${file.filename}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "42501") return refuse(403, "forbidden");
    console.error("Export failed:", slug, format, error);
    const outdated = OUTDATED.has(code) || (await databaseUpdateNeeded().catch(() => false));
    return refuse(outdated ? 503 : 500, outdated ? "outdated" : "failed");
  }
}
