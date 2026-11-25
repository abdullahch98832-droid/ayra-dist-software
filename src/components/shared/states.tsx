import { Inbox, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconTile } from "./icon-tile";
import { Skeleton } from "@/components/ui/skeleton";

const TONE = { neutral: "blue", danger: "danger", warning: "attention" } as const;
const RING = { neutral: "border-primary/15", danger: "border-destructive/15", warning: "border-warning/20" } as const;

/** Shared layout for empty, error, not-found, forbidden and planned screens. */
export function StateMessage({
  icon: Icon = Inbox, tone = "neutral", title, description, actions, className, headingLevel: Heading = "h2", children,
}: {
  icon?: LucideIcon;
  tone?: keyof typeof TONE;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
  headingLevel?: "h1" | "h2" | "p";
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-6 py-12 text-center", className)}>
      <span className="relative flex size-24 items-center justify-center" aria-hidden>
        <span className="dotted absolute inset-0 text-primary/25 [mask-image:radial-gradient(closest-side,black,transparent)]" />
        <span className={cn("absolute inset-2 rounded-full border border-dashed", RING[tone])} />
        <IconTile icon={Icon} tone={TONE[tone]} size="lg" className="relative shadow-card" />
      </span>
      <div className="grid max-w-md gap-1">
        <Heading className="text-base font-semibold text-navy">{title}</Heading>
        {description && <p className="text-sm text-balance text-muted-foreground">{description}</p>}
      </div>
      {children}
      {actions && <div className="flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}

/** Empty state inside a card-like surface. */
export function EmptyState(props: React.ComponentProps<typeof StateMessage>) {
  return <StateMessage {...props} className={cn("rounded-2xl border border-dashed bg-card", props.className)} />;
}

export function PageHeaderSkeleton() {
  return (
    <div className="mb-6 grid gap-2">
      <Skeleton className="h-8 w-56 max-w-full" />
      <Skeleton className="h-4 w-80 max-w-full" />
    </div>
  );
}

export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
      <div className="border-b bg-muted/60 px-4 py-3.5"><Skeleton className="h-4 w-40" /></div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-b px-4 py-3.5 last:border-0">
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="hidden h-4 w-24 sm:block" />
          <Skeleton className="hidden h-4 w-20 md:block" />
        </div>
      ))}
    </div>
  );
}

export function CardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }, (_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}
    </div>
  );
}

export function FormSkeleton() {
  return (
    <div className="grid max-w-4xl gap-6">
      {[0, 1].map((section) => (
        <div key={section} className="grid gap-5 rounded-2xl border bg-card p-5 shadow-card sm:grid-cols-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="grid gap-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-10" /></div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="h-full rounded-2xl border bg-card p-5 shadow-card">
      <Skeleton className="h-5 w-40" />
      <div className="mt-5 grid gap-4">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center justify-between gap-6">
            <div className="grid flex-1 gap-1.5"><Skeleton className="h-4 w-3/5" /><Skeleton className="h-3 w-2/5" /></div>
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChartsSkeleton() {
  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-80 rounded-2xl" />)}
      </div>
    </div>
  );
}
