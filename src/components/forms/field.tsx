"use client";

import { ChevronDown, CircleAlert, CircleCheck, Info } from "lucide-react";
import { cloneElement, isValidElement } from "react";
import { useI18n } from "@/i18n/context";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Translates a validation message key from the errors or auth dictionaries. */
export function useMessage() {
  const { t } = useI18n();
  return (key: string | undefined) => {
    if (!key) return undefined;
    const errors = t.errors as Record<string, string>;
    const auth = t.auth as Record<string, string>;
    return errors[key] ?? auth[key] ?? key;
  };
}

/**
 * Label, control, hint and error. A single element child automatically receives
 * aria-invalid and aria-describedby. Messages are stored as keys, so switching
 * language re-translates visible errors.
 */
export function Field({
  id, label, hint, error, required, optional, className, children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  optional?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const message = useMessage();
  const text = message(error);
  const describedBy = text ? `${id}-error` : hint ? `${id}-hint` : undefined;
  const control = isValidElement<Record<string, unknown>>(children)
    ? cloneElement(children, { "aria-invalid": text ? true : undefined, "aria-describedby": describedBy })
    : children;
  return (
    <div className={cn("grid content-start gap-2", className)}>
      <Label htmlFor={id} className="flex-wrap gap-x-1.5 gap-y-0">
        {label}
        {required && <span className="text-destructive" title={t.common.required} aria-hidden>*</span>}
        {optional && <span className="text-xs font-normal text-muted-foreground">({t.common.optional})</span>}
      </Label>
      {control}
      {text ? (
        <p id={`${id}-error`} role="alert" className="flex items-start gap-1.5 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />{text}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

const ALERT = {
  error: { icon: CircleAlert, className: "border-destructive/25 bg-destructive-soft text-destructive" },
  success: { icon: CircleCheck, className: "border-success/25 bg-success-soft text-success" },
  info: { icon: Info, className: "border-primary/20 bg-accent text-accent-foreground" },
} as const;

export function FormAlert({ tone = "error", children }: { tone?: keyof typeof ALERT; children: React.ReactNode }) {
  const { icon: Icon, className } = ALERT[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm", className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}

/** Native select: best on phones, and keeps its value when option labels change language. */
export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <div className={cn("relative", className)}>
      <select
        data-slot="native-select"
        className={cn(
          "h-10 w-full appearance-none truncate rounded-lg border border-input bg-card ps-3 pe-9 text-base shadow-xs transition-colors outline-none md:text-sm",
          "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25 disabled:opacity-50",
          "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20"
        )}
        {...props}
      />
      <ChevronDown className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
    </div>
  );
}
