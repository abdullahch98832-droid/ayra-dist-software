import { APP_CONFIG } from "@/config/app";
import { cn } from "@/lib/utils";

/** AYRA HAPPINESS wordmark with the system name beneath it. */
export function Brand({ subtitle, tone = "navy", size = "md", className }: {
  subtitle: string;
  tone?: "navy" | "white";
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
          tone === "white" ? "text-white" : "text-navy"
        )}>
          {APP_CONFIG.name}
        </p>
        <p className={cn("text-xs leading-tight", tone === "white" ? "text-white/75" : "text-muted-foreground")}>{subtitle}</p>
      </div>
    </div>
  );
}

export function BrandMark({ tone = "navy", className }: { tone?: "navy" | "white"; className?: string }) {
  return (
    <span aria-hidden className={cn(
      "font-latin font-heading flex shrink-0 items-center justify-center rounded-lg leading-none",
      tone === "white" ? "bg-white text-navy" : "bg-navy text-white",
      className
    )}>
      A
    </span>
  );
}
