"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useI18n } from "@/i18n/context";
import { fill } from "@/i18n/format";
import { formatNumber } from "@/components/shared/format";
import { Button } from "@/components/ui/button";

/** Paging controls; usable on its own for lists paged on the server. */
export function TablePagination({
  page, pageSize, total, onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const { t, locale } = useI18n();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const n = (value: number) => formatNumber(value, locale);
  const range = fill(t.table.range, { from: n((page - 1) * pageSize + 1), to: n(Math.min(page * pageSize, total)), total: n(total) });
  return (
    <nav aria-label={t.table.pagination} className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground print:hidden">
      <p aria-live="polite">{range}</p>
      {pages > 1 && (
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline">{fill(t.table.page, { page: n(page), pages: n(pages) })}</span>
          <Button variant="outline" size="icon" aria-label={t.table.previous} disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            <ChevronLeft className="rtl:-scale-x-100" />
          </Button>
          <Button variant="outline" size="icon" aria-label={t.table.next} disabled={page >= pages} onClick={() => onPageChange(page + 1)}>
            <ChevronRight className="rtl:-scale-x-100" />
          </Button>
        </div>
      )}
    </nav>
  );
}
