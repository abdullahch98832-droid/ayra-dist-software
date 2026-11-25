import "server-only";
import { APP_CONFIG } from "@/config/app";
import { can, type SessionContext } from "@/lib/auth/session";
import { uuidParam } from "@/lib/page-context";
import { DOC_LANGUAGES, type DocLanguage, type DocModel } from "@/lib/pdf/model";
import { renderPdf } from "@/lib/pdf/render";
import type { Locale } from "@/types";
import { fill } from "@/i18n/format";
import { buildDocument } from "./build";
import { loadDocument, loadDocumentSettings, loadSalarySlips } from "./data";
import { bi } from "./format";
import { DOCUMENT_KINDS, kindSlug, type DocumentKind } from "./kinds";
import { buildReport, type Query } from "./reports";

export const mayOpen = (ctx: SessionContext, kind: DocumentKind) => {
  const { permissions } = DOCUMENT_KINDS[kind];
  return !permissions || permissions.some((p) => can(ctx, p));
};

export function documentLanguage(value: string | string[] | undefined, locale: Locale): DocLanguage {
  return DOC_LANGUAGES.find((l) => l === value) ?? locale;
}

async function models(kind: DocumentKind, ctx: SessionContext, query: Query): Promise<{ list: DocModel[]; note: string }> {
  if (DOCUMENT_KINDS[kind].needs !== "id") {
    const model = await buildReport(kind, ctx, query);
    return { list: model ? [model] : [], note: model?.period?.en ?? "" };
  }
  const id = uuidParam(query.id);
  if (!id) return { list: [], note: "" };
  const settings = await loadDocumentSettings();
  const documents = kind === "salary_slips" ? await loadSalarySlips(id) : [await loadDocument(kind === "sol_receipt" ? "customer_receipt" : kind, id)].filter((d) => d !== null);
  return { list: documents.map((d) => buildDocument(kind, d, settings)), note: documents[0]?.number ?? "" };
}

export interface GeneratedDocument { bytes: Uint8Array; filename: string }

/** The PDF of a document, from the saved transaction as this user may see it. Null when there is nothing to show. */
export async function generateDocument(kind: DocumentKind, ctx: SessionContext, query: Query, language: DocLanguage): Promise<GeneratedDocument | null> {
  const [{ list, note }, settings] = await Promise.all([models(kind, ctx, query), loadDocumentSettings()]);
  if (list.length === 0) return null;
  const created = new Date();
  const name = APP_CONFIG.name;
  const printed = (locale: Locale, subtitle: string) => {
    const stamp = new Intl.DateTimeFormat(locale === "ur" ? "ur-PK" : "en-PK", { dateStyle: "medium", timeStyle: "short", numberingSystem: "latn", timeZone: APP_CONFIG.timeZone }).format(created);
    return fill(bi((t) => t.docs.printed)[locale], { name: locale === "ur" ? settings.company_name_ur || name : name, subtitle, date: `⁨${stamp}⁩`, user: `⁨${ctx.fullName || ctx.email}⁩` });
  };
  const subtitle = bi((t) => t.docs.letterhead);
  const bytes = renderPdf(list, {
    language,
    title: [(kind === "report" ? list[0]?.title ?? bi((t) => t.docs.kinds.report) : bi((t) => t.docs.kinds[kind]))[language === "ur" ? "ur" : "en"], note].filter(Boolean).join(" "),
    created,
    letterhead: {
      name, nameUr: settings.company_name_ur, subtitle, address: { en: settings.company_address, ur: settings.company_address_ur }, phone: settings.company_phone, email: settings.company_email, ntn: settings.company_ntn,
    },
    words: { page: bi((t) => t.docs.page), ntn: bi((t) => t.docs.labels.ntn), printed: { en: printed("en", subtitle.en), ur: printed("ur", subtitle.ur) } },
  });
  const file = [kind === "report" && typeof query.report === "string" ? query.report : kindSlug(kind), note, language === "en" ? "" : language].filter(Boolean).join("-").replace(/[^A-Za-z0-9-]+/g, "-").replace(/-+/g, "-");
  return { bytes, filename: `${file}.pdf` };
}
