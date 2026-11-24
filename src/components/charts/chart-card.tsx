"use client";

import { useId, useState } from "react";
import { ChartNoAxesColumn, Table2 } from "lucide-react";
import { useI18n } from "@/i18n/context";
import { StateMessage } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SERIES_COLORS, type ChartPoint, type ChartSeries } from "./types";

/** Frame for every chart: title, legend (two or more series) and the same data as a table. */
export function ChartCard({
  title, description, categoryLabel, series, points, emptyText, children,
}: {
  title: string;
  description?: string;
  categoryLabel?: string;
  series: ChartSeries[];
  points: ChartPoint[];
  emptyText?: string;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const [asTable, setAsTable] = useState(false);
  const titleId = useId();
  const Icon = asTable ? ChartNoAxesColumn : Table2;
  const toggle = asTable ? t.charts.viewChart : t.charts.viewTable;
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle><h2 id={titleId}>{title}</h2></CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {points.length > 0 && (
          <CardAction>
            <Button variant="ghost" size="icon-sm" aria-label={toggle} title={toggle} aria-pressed={asTable} onClick={() => setAsTable((v) => !v)}>
              <Icon />
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {points.length === 0 ? (
          <StateMessage icon={ChartNoAxesColumn} title={emptyText ?? t.charts.noData} headingLevel="p" className="py-8" />
        ) : asTable ? (
          <div className="overflow-hidden rounded-lg border">
            <Table aria-labelledby={titleId}>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{categoryLabel ?? t.charts.category}</TableHead>
                  {series.map((s) => <TableHead key={s.key} scope="col" className="text-end">{s.label}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {points.map((p) => (
                  <TableRow key={p.label}>
                    <TableCell>{p.label}</TableCell>
                    {series.map((s, i) => (
                      <TableCell key={s.key} className="text-end tabular-nums"><bdi dir="ltr">{p.values[i]?.display ?? "—"}</bdi></TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <figure aria-labelledby={titleId} className="grid grid-cols-1 gap-4">
            {series.length > 1 && (
              <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {series.map((s, i) => (
                  <span key={s.key} className="inline-flex items-center gap-1.5">
                    <span className="size-2.5 rounded-[3px]" style={{ background: SERIES_COLORS[i] }} aria-hidden />{s.label}
                  </span>
                ))}
              </figcaption>
            )}
            {children}
          </figure>
        )}
      </CardContent>
    </Card>
  );
}

/** Tooltip shared by all charts: value first, then the series name. */
export function ChartTooltip({ point, series, className, style }: { point: ChartPoint; series: ChartSeries[]; className?: string; style?: React.CSSProperties }) {
  return (
    <div role="status" style={style} className={`pointer-events-none absolute z-10 grid w-max max-w-56 gap-1 rounded-lg border bg-popover px-3 py-2 text-xs shadow-overlay ${className ?? ""}`}>
      <p className="text-muted-foreground">{point.label}</p>
      {series.map((s, i) => (
        <p key={s.key} className="flex items-center gap-2">
          <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: SERIES_COLORS[i] }} aria-hidden />
          <bdi dir="ltr" className="font-semibold text-foreground tabular-nums">{point.values[i]?.display ?? "—"}</bdi>
          {series.length > 1 && <span className="text-muted-foreground">{s.label}</span>}
        </p>
      ))}
    </div>
  );
}
