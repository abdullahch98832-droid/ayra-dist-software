"use client";

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

export function Field({
  id,
  label,
  hint,
  error,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const message = useMessage();
  const text = message(error);
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {text ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{text}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function FormAlert({ tone = "error", children }: { tone?: "error" | "success" | "info"; children: React.ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-md border px-3 py-2 text-sm",
        tone === "error" && "border-destructive/30 bg-destructive/5 text-destructive",
        tone === "success" && "border-emerald-600/30 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
        tone === "info" && "border-primary/20 bg-primary/5 text-foreground"
      )}
    >
      {children}
    </div>
  );
}

export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}
