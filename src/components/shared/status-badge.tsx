import { cn } from "@/lib/utils";

const TONES = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950 dark:text-emerald-300",
  blue: "bg-primary/10 text-primary ring-primary/20",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-950 dark:text-amber-300",
  red: "bg-destructive/10 text-destructive ring-destructive/20",
  gray: "bg-muted text-muted-foreground ring-border",
} as const;

export type BadgeTone = keyof typeof TONES;

export function StatusBadge({ tone, children }: { tone: BadgeTone; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", TONES[tone])}>
      {children}
    </span>
  );
}
