"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LoaderCircle, Search } from "lucide-react";
import { useI18n } from "@/i18n/context";
import { cn } from "@/lib/utils";
import { NativeSelect } from "@/components/forms/field";
import { Input } from "@/components/ui/input";
import { TablePagination } from "./table-pagination";

function useUrlParam(param: string) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const set = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(param, value);
    else next.delete(param);
    if (param !== "page") next.delete("page"); // a new filter starts at its first page
    const query = next.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  };
  return { value: params.get(param) ?? "", set, pending };
}

/** Server-side search: writes `?q=` after a short pause in typing. */
export function UrlSearch({ param = "q", placeholder }: { param?: string; placeholder?: string }) {
  const { t } = useI18n();
  const { value, set, pending } = useUrlParam(param);
  const [text, setText] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latestSet = useRef(set);
  useEffect(() => { latestSet.current = set; });
  useEffect(() => () => clearTimeout(timer.current), []);

  const change = (next: string) => {
    setText(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => latestSet.current(next.trim()), 350);
  };

  const Icon = pending ? LoaderCircle : Search;
  return (
    <div role="search" className="relative w-full sm:w-72">
      <Icon className={`pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground ${pending ? "animate-spin" : ""}`} aria-hidden />
      <Input type="search" value={text} onChange={(e) => change(e.target.value)} placeholder={placeholder ?? t.common.search}
        aria-label={placeholder ?? t.common.search} className="ps-9" />
    </div>
  );
}

export function UrlSelect({ param, label, options, className }: { param: string; label: string; options: { value: string; label: string }[]; className?: string }) {
  const { value, set, pending } = useUrlParam(param);
  return (
    <NativeSelect aria-label={label} value={value} disabled={pending} onChange={(e) => set(e.target.value)} className={cn("w-full sm:w-48", className)}>
      <option value="">{label}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </NativeSelect>
  );
}

/** Paging for lists that the server cuts into pages: writes `?page=`. */
export function UrlPagination({ page, pageSize, total }: { page: number; pageSize: number; total: number }) {
  const { set } = useUrlParam("page");
  return total > 0 ? <TablePagination page={page} pageSize={pageSize} total={total} onPageChange={(p) => set(p > 1 ? String(p) : "")} /> : null;
}

/** One date in the address; `fallback` is shown when there is none. */
export function UrlDate({ param, label, max, fallback }: { param: string; label: string; max?: string; fallback: string }) {
  const { value, set, pending } = useUrlParam(param);
  return (
    <label className="flex w-full items-center gap-2 text-sm text-muted-foreground sm:w-auto">
      {label}
      <Input type="date" dir="ltr" value={value || fallback} max={max} disabled={pending} onChange={(e) => set(e.target.value === fallback ? "" : e.target.value)} className="w-full sm:w-40" />
    </label>
  );
}
