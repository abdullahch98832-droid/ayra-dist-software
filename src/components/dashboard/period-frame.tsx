"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { CalendarRange, LoaderCircle } from "lucide-react";
import { MAX_PERIOD_DAYS, PERIOD_PRESETS, daysBetween, type Period, type PeriodPreset } from "@/features/dashboard/period";
import { useI18n } from "@/i18n/context";
import { cn } from "@/lib/utils";
import { formatDate } from "@/components/shared/format";
import { NativeSelect } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Date filter and everything it scopes. While new figures load, the old ones stay in
 * place, dimmed. The period lives in the URL, so it survives reloads and can be shared.
 */
export function PeriodFrame({ period, today, title, description, children }: {
  period: Period;
  today: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const id = useId();
  const [pending, startTransition] = useTransition();
  const [preset, setPreset] = useState<PeriodPreset>(period.preset);
  const [from, setFrom] = useState(period.from);
  const [to, setTo] = useState(period.to);
  const [invalid, setInvalid] = useState(false);

  // Other filters of the page stay; a new period starts at its first page.
  const go = (params: Record<string, string>) => {
    const next = new URLSearchParams(search);
    for (const key of ["range", "from", "to", "page"]) next.delete(key);
    for (const [key, value] of Object.entries(params)) next.set(key, value);
    startTransition(() => router.replace(`${pathname}?${next}`, { scroll: false }));
  };

  const choose = (next: PeriodPreset) => {
    setPreset(next);
    setInvalid(false);
    if (next === "custom") {
      setFrom(period.from);
      setTo(period.to);
    } else go({ range: next });
  };

  const apply = (event: React.FormEvent) => {
    event.preventDefault();
    const ok = !!from && !!to && from <= to && daysBetween(from, to) <= MAX_PERIOD_DAYS;
    setInvalid(!ok);
    if (ok) go({ range: "custom", from, to });
  };

  return (
    <section aria-labelledby={`${id}-title`} className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h2 id={`${id}-title`} className="text-lg font-semibold text-navy">{title}</h2>
          <p className="text-sm text-muted-foreground">
            <bdi>{formatDate(period.from, locale)}</bdi>{period.from !== period.to && <> – <bdi>{formatDate(period.to, locale)}</bdi></>}
            {" · "}{description}
          </p>
        </div>
        <form onSubmit={apply} className="print:hidden flex w-full flex-wrap items-end gap-2 sm:w-auto">
          <div className="grid w-full gap-1.5 sm:w-48">
            <label htmlFor={`${id}-preset`} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {pending ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <CalendarRange className="size-3.5" aria-hidden />}
              {t.dashboard.filter.label}
            </label>
            <NativeSelect id={`${id}-preset`} value={preset} onChange={(e) => choose(e.target.value as PeriodPreset)}>
              {PERIOD_PRESETS.map((p) => <option key={p} value={p}>{t.dashboard.filter.presets[p]}</option>)}
            </NativeSelect>
          </div>
          {preset === "custom" && (
            <>
              <div className="grid flex-1 gap-1.5 sm:w-40 sm:flex-none">
                <label htmlFor={`${id}-from`} className="text-xs text-muted-foreground">{t.dashboard.filter.from}</label>
                <Input id={`${id}-from`} type="date" dir="ltr" value={from} max={today} onChange={(e) => setFrom(e.target.value)} aria-invalid={invalid || undefined} />
              </div>
              <div className="grid flex-1 gap-1.5 sm:w-40 sm:flex-none">
                <label htmlFor={`${id}-to`} className="text-xs text-muted-foreground">{t.dashboard.filter.to}</label>
                <Input id={`${id}-to`} type="date" dir="ltr" value={to} max={today} onChange={(e) => setTo(e.target.value)} aria-invalid={invalid || undefined} />
              </div>
              <Button type="submit" size="lg" className="h-10 w-full sm:w-auto" disabled={pending}>{t.dashboard.filter.apply}</Button>
            </>
          )}
        </form>
      </div>
      {invalid && <p role="alert" className="text-sm text-destructive">{t.dashboard.filter.invalid}</p>}
      <div aria-busy={pending} className={cn("grid gap-6 transition-opacity", pending && "opacity-60")}>{children}</div>
    </section>
  );
}
