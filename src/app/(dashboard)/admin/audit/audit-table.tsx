"use client";

import { ArrowRight } from "lucide-react";
import type { AccessAuditRow } from "@/features/audit/access-audit";
import { useI18n } from "@/i18n/context";
import { formatDateTime } from "@/components/shared/format";
import { DataTable, type DataTableColumn } from "@/components/tables/data-table";

export function AuditTable({ rows }: { rows: AccessAuditRow[] }) {
  const { t, locale } = useI18n();
  const columns: DataTableColumn<AccessAuditRow>[] = [
    { id: "what", header: t.audit.what, primary: true, sortValue: (r) => r.action, className: "align-top",
      cell: (r) => <div className="min-w-0"><p className="font-medium break-words">{r.subject || "—"}</p><p className="text-xs text-muted-foreground">{r.action}</p></div> },
    { id: "details", header: t.audit.changes, className: "align-top",
      cell: (r) => r.changes.length === 0 ? "—" : (
        <ul className="grid gap-1">
          {r.changes.map((c) => (
            <li key={c.field} className="flex flex-wrap items-center gap-x-1.5 text-xs max-md:justify-end">
              <span className="text-muted-foreground">{c.field}:</span>
              {c.before !== undefined && <bdi className="break-all">{c.before}</bdi>}
              {c.before !== undefined && <ArrowRight className="size-3 text-muted-foreground rtl:-scale-x-100" aria-hidden />}
              <bdi className="font-medium break-all">{c.after ?? "—"}</bdi>
            </li>
          ))}
        </ul>
      ) },
    { id: "who", header: t.audit.who, sortValue: (r) => r.actor, className: "align-top", cell: (r) => r.actor },
    { id: "when", header: t.audit.when, sortValue: (r) => r.occurredAt, className: "align-top whitespace-nowrap", cell: (r) => formatDateTime(r.occurredAt, locale) },
  ];
  return (
    <DataTable
      rows={rows} columns={columns} rowKey={(r) => r.id} caption={t.audit.title}
      searchText={(r) => [r.subject, r.action, r.actor, ...r.changes.flatMap((c) => [c.field, c.before, c.after])].join(" ")}
      empty={{ title: t.states.emptyTitle }}
    />
  );
}
