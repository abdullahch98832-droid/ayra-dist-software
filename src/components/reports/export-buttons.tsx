"use client";

import { useState } from "react";
import { FileSpreadsheet, FileText, LoaderCircle, Table2 } from "lucide-react";
import { documentHref } from "@/features/documents/kinds";
import { useI18n } from "@/i18n/context";
import { usePermission } from "@/components/layout/permissions";
import { LinkButton } from "@/components/shared/link-button";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

/** PDF, Excel and CSV of the report as it is selected now. */
export function ExportButtons({ slug, params }: { slug: string; params: Record<string, string> }) {
  const { t, locale } = useI18n();
  const [busy, setBusy] = useState<"xlsx" | "csv" | null>(null);
  const allowed = usePermission("reports.export");
  if (!allowed) return null;
  const a = t.analytics;

  const save = async (format: "xlsx" | "csv") => {
    setBusy(format);
    try {
      const response = await fetch(`/reports/${slug}/export?${new URLSearchParams({ ...params, format, lang: locale })}`);
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { code?: string };
        toast.add({ title: body.code === "forbidden" || body.code === "unauthorized" ? a.exportForbidden : body.code === "outdated" ? a.exportOutdated : a.exportFailed, type: "error" });
        return;
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? `${slug}.${format}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.add({ title: a.exportDone, type: "success" });
    } catch {
      toast.add({ title: a.exportFailed, type: "error" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div role="group" aria-label={a.exportAs} className="flex flex-wrap gap-2">
      <LinkButton variant="outline" href={documentHref("report", { report: slug, ...params })} prefetch={false}><FileText aria-hidden />{a.pdf}</LinkButton>
      <Button variant="outline" disabled={busy !== null} onClick={() => void save("xlsx")}>{busy === "xlsx" ? <LoaderCircle aria-hidden className="animate-spin" /> : <FileSpreadsheet aria-hidden />}{a.excel}</Button>
      <Button variant="outline" disabled={busy !== null} onClick={() => void save("csv")}>{busy === "csv" ? <LoaderCircle aria-hidden className="animate-spin" /> : <Table2 aria-hidden />}{a.csv}</Button>
    </div>
  );
}
