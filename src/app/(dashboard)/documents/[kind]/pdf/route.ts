import type { NextRequest } from "next/server";
import { DocumentMismatch } from "@/features/documents/data";
import { documentLanguage, generateDocument, mayOpen } from "@/features/documents/generate";
import { kindOfSlug } from "@/features/documents/kinds";
import { getLocale } from "@/i18n/server";
import { databaseUpdateNeeded } from "@/lib/supabase/schema-state";
import { AuthorizationError, getSessionContext } from "@/lib/auth/session";

/** Functions missing from the database: the newest migration has not been applied. */
const OUTDATED = new Set(["PGRST202", "42883"]);

const refuse = (status: number, code: string) => Response.json({ code }, { status, headers: { "Cache-Control": "private, no-store" } });

export async function GET(request: NextRequest, { params }: RouteContext<"/documents/[kind]/pdf">) {
  const kind = kindOfSlug((await params).kind);
  if (!kind) return refuse(404, "notFound");
  const ctx = await getSessionContext();
  if (!ctx) return refuse(401, "unauthorized");
  if (!ctx.isActive || !ctx.role || !mayOpen(ctx, kind)) return refuse(403, "forbidden");
  const query = Object.fromEntries(request.nextUrl.searchParams);
  try {
    const document = await generateDocument(kind, ctx, query, documentLanguage(query.lang, await getLocale()));
    if (!document) return refuse(404, "notFound");
    return new Response(new Uint8Array(document.bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${query.download ? "attachment" : "inline"}; filename="${document.filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof DocumentMismatch) {
      console.error("Document refused:", kind, error.message);
      return refuse(409, "mismatch");
    }
    if (error instanceof AuthorizationError) return refuse(403, "forbidden");
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "42501") return refuse(403, "forbidden");
    if (code === "P0002") return refuse(404, "notFound");
    console.error("Document failed:", kind, error);
    const outdated = OUTDATED.has(code) || (await databaseUpdateNeeded().catch(() => false));
    return refuse(outdated ? 503 : 500, outdated ? "outdated" : "failed");
  }
}
