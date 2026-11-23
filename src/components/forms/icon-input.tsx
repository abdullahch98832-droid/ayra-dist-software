import type { LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Input with a leading icon on the reading-start side. */
export function IconInput({ icon: Icon, className, ...props }: React.ComponentProps<typeof Input> & { icon: LucideIcon }) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input {...props} className={cn("px-10", className)} />
    </div>
  );
}
