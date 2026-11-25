import type { LucideIcon } from "lucide-react";
import { IconTile } from "./icon-tile";

/** Title of a group of cards on a page. */
export function SectionHeading({ id, title, description, icon }: { id?: string; title: React.ReactNode; description?: React.ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex items-center gap-3">
      {icon && <IconTile icon={icon} size="sm" tone="blue" className="print:hidden" />}
      <div className="min-w-0">
        <h2 id={id} className="text-lg font-semibold tracking-[-0.01em] text-navy">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
    </div>
  );
}
