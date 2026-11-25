import { APP_CONFIG } from "@/config/app";
import { cn } from "@/lib/utils";

/** AYRA HAPPINESS wordmark with the system name beneath it. */
export function Brand({ subtitle, tone = "navy", size = "md", className }: {
  subtitle: string;
  tone?: "navy" | "white" | "sidebar";
  size?: "md" | "lg";
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <BrandMark tone={tone} className={size === "lg" ? "size-12 text-2xl" : "size-10 text-xl"} />
      <div className="min-w-0 group-data-[collapsible=icon]:hidden">
        <p className={cn(
          "font-latin font-heading tracking-[0.08em] whitespace-nowrap",
          size === "lg" ? "text-xl" : "text-[0.95rem]",
          tone === "navy" ? "text-navy" : "text-white"
        )}>
          {APP_CONFIG.name}
        </p>
        <p className={cn("text-xs leading-tight", tone === "navy" ? "text-muted-foreground" : "text-white/70")}>{subtitle}</p>
      </div>
    </div>
  );
}

export function BrandMark({ tone = "navy", className }: { tone?: "navy" | "white" | "sidebar"; className?: string }) {
  return (
    <span aria-hidden className={cn(
      "font-latin font-heading relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl leading-none shadow-action",
      tone === "white" ? "bg-[linear-gradient(145deg,#ffffff,#d5e3ff)] text-navy" : "bg-[linear-gradient(145deg,#3f7dff,#1a47ad)] text-white",
      className
    )}>
      A
    </span>
  );
}
