import { cn } from "@/lib/utils";

const TONES = {
  green: "bg-success-soft text-success",
  blue: "bg-accent text-accent-foreground",
  amber: "bg-warning-soft text-warning",
  red: "bg-destructive-soft text-destructive",
  gray: "bg-muted text-muted-foreground",
} as const;

export type BadgeTone = keyof typeof TONES;

/** State label. The dot supports the text; colour is never the only signal. */
export function StatusBadge({ tone, dot = true, children }: { tone: BadgeTone; dot?: boolean; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", TONES[tone])}>
      {dot && <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}
