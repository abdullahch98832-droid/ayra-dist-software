import Image from "next/image";
import { APP_CONFIG } from "@/config/app";
import { cn } from "@/lib/utils";

/** AM TRADERS: the AM mark with the name and the system name beneath it, or the whole logo on a dark panel. */
export function Brand({ subtitle, tone = "navy", size = "md", full = false, className }: {
  subtitle: string;
  tone?: "navy" | "white" | "sidebar";
  size?: "md" | "lg";
  /** The whole logo; only on a dark background, which it is made for. */
  full?: boolean;
  className?: string;
}) {
  if (full) {
    return (
      <div className={cn("min-w-0", className)}>
        <Image src={APP_CONFIG.logo.full} alt={APP_CONFIG.name} width={640} height={293} priority className="h-auto w-60 xl:w-72" />
        <p className="mt-2 text-sm text-white/75">{subtitle}</p>
      </div>
    );
  }
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <BrandMark className={size === "lg" ? "size-12" : "size-10"} />
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

/** The AM monogram on its navy tile. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <Image
      src={APP_CONFIG.logo.mark} alt="" aria-hidden width={96} height={96}
      className={cn("shrink-0 rounded-xl shadow-action ring-1 ring-white/15", className)}
    />
  );
}
