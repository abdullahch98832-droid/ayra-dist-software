import { cn } from "@/lib/utils";

const TONES = {
  green: "bg-success-soft text-success ring-success/20",
  blue: "bg-accent text-accent-foreground ring-primary/20",
  amber: "bg-warning-soft text-warning ring-warning/20",
  red: "bg-destructive-soft text-destructive ring-destructive/20",
  gray: "bg-muted text-muted-foreground ring-foreground/10",
} as const;

export type BadgeTone = keyof typeof TONES;

/** State label. The dot supports the text; colour is never the only signal. */
export function StatusBadge({ tone, dot = true, children }: { tone: BadgeTone; dot?: boolean; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset", TONES[tone])}>
      {dot && <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}
