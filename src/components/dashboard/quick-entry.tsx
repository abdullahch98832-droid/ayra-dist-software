import Link from "next/link";
import type { Dictionary } from "@/i18n";
import { IconTile } from "@/components/shared/icon-tile";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { isPlanned, quickActions } from "./quick-actions";

export function QuickEntry({ permissions, t }: { permissions: ReadonlySet<string>; t: Dictionary }) {
  const actions = quickActions(permissions);
  if (actions.length === 0) return null;
  return (
    <SectionCard title={t.dashboard.work.quick} description={t.dashboard.work.quickHint}>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {actions.map((a) => {
          const planned = isPlanned(a);
          const body = (
            <>
              <IconTile icon={a.icon} />
              <span className="min-w-0 flex-1 text-sm font-medium">{t.dashboard.quick[a.key]}</span>
              {planned && <StatusBadge tone="gray" dot={false}>{t.nav.planned}</StatusBadge>}
            </>
          );
          const classes = "flex items-center gap-3 rounded-xl border px-3 py-3";
          return (
            <li key={a.key}>
              {planned
                ? <div className={`${classes} bg-muted/40 text-muted-foreground`}>{body}</div>
                : <Link href={a.href} className={`${classes} lift bg-card outline-none focus-visible:ring-3 focus-visible:ring-ring/40`}>{body}</Link>}
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
