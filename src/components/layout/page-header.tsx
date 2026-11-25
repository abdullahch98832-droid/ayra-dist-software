import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getT } from "@/i18n/server";
import { cn } from "@/lib/utils";
import { ModuleIcon } from "./module-icon";

export interface Crumb {
  label: string;
  href: string;
}

/** Page title with optional trail, description and actions. */
export async function PageHeader({
  title, description, actions, breadcrumbs,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumbs?: Crumb[];
}) {
  const t = await getT();
  return (
    <div className="mb-6">
      {breadcrumbs && (
        <nav aria-label={t.common.breadcrumb} className="mb-2 print:hidden">
          <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
            {breadcrumbs.map((c) => (
              <li key={c.href} className="flex items-center gap-1">
                <Link href={c.href} className="rounded hover:text-primary">{c.label}</Link>
                <ChevronRight className="size-3.5 rtl:-scale-x-100" aria-hidden />
              </li>
            ))}
            <li aria-current="page" className="min-w-0 truncate text-foreground">{title}</li>
          </ol>
        </nav>
      )}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 items-center gap-4">
          <ModuleIcon />
          <div className="min-w-0">
            {/* The display face draws a zero like the letter O, so document numbers use the text face. */}
            <h1 className={cn("text-2xl break-words text-navy sm:text-[1.85rem] sm:leading-10", /\d/.test(title) ? "font-semibold tracking-[-0.02em]" : "font-heading")}>{title}</h1>
            {description && <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-2 print:hidden">{actions}</div>}
      </div>
    </div>
  );
}
