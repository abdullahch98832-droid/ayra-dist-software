import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findReport } from "@/features/reports/registry";
import { documentLanguage, mayOpen } from "@/features/documents/generate";
import { kindOfSlug, kindSlug } from "@/features/documents/kinds";
import { mayExport } from "@/features/reports/load";
import { getLocale, getT } from "@/i18n/server";
import { requireActiveSession } from "@/lib/auth/session";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { DocumentViewer } from "./viewer";

export async function generateMetadata({ params }: PageProps<"/documents/[kind]">): Promise<Metadata> {
  const kind = kindOfSlug((await params).kind);
  const t = await getT();
  return { title: kind ? t.docs.kinds[kind] : t.docs.title };
}

export default async function DocumentPage({ params, searchParams }: PageProps<"/documents/[kind]">) {
  const kind = kindOfSlug((await params).kind);
  if (!kind) notFound();
  const ctx = await requireActiveSession();
  if (!mayOpen(ctx, kind)) return <Forbidden />;
  const [t, locale, search] = await Promise.all([getT(), getLocale(), searchParams]);
  const language = documentLanguage(search.lang, locale);
  const report = kind === "report" && typeof search.report === "string" ? findReport(search.report) : null;
  if (kind === "report" && !report) notFound();
  if (report && !mayExport(ctx, report)) return <Forbidden />;
  const query = new URLSearchParams(Object.entries(search).flatMap(([k, v]) => (typeof v === "string" && k !== "lang" && k !== "download" ? [[k, v]] : [])));
  query.set("lang", language);
  return (
    <>
      <PageHeader title={report ? report.title[locale] : t.docs.kinds[kind]} breadcrumbs={report ? [{ label: t.reports.title, href: "/reports" }, { label: report.title[locale], href: `/reports/${report.slug}` }] : undefined} />
      <DocumentViewer url={`/documents/${kindSlug(kind)}/pdf?${query}`} language={language} />
    </>
  );
}
