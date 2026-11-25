import Link from "next/link";
import { CalendarDays, Plus, ShieldCheck } from "lucide-react";
import { RouteLines } from "@/components/layout/route-lines";

/** Banner of the dashboard: greeting, role, date and the actions the user may take. */
export function DashboardHero({ title, description, role, date, actions, actionsLabel }: {
  title: string;
  description: string;
  role: string;
  date: string;
  actions: { href: string; label: string }[];
  actionsLabel: string;
}) {
  return (
    <section className="bg-brand relative mb-8 overflow-hidden rounded-3xl px-6 py-7 text-white shadow-raised sm:px-9 sm:py-9 print:hidden">
      <RouteLines className="pointer-events-none absolute inset-y-0 end-0 hidden h-full w-[58%] [mask-image:linear-gradient(to_right,transparent,black_38%)] xl:block rtl:-scale-x-100" />
      <span aria-hidden className="pointer-events-none absolute -start-24 -bottom-32 size-72 rounded-full bg-[#5b94ff]/20 blur-3xl" />
      <div className="relative max-w-2xl">
        <p className="flex flex-wrap gap-2 text-xs">
          {role && <span className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-1 ring-1 ring-white/15 ring-inset"><ShieldCheck className="size-3.5" aria-hidden />{role}</span>}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-1 ring-1 ring-white/15 ring-inset"><CalendarDays className="size-3.5" aria-hidden /><bdi>{date}</bdi></span>
        </p>
        <h1 className="font-heading mt-4 text-3xl break-words text-balance sm:text-[2.5rem] sm:leading-tight">{title}</h1>
        <p className="mt-2 text-sm text-white/80 sm:text-base">{description}</p>
        {actions.length > 0 && (
          <nav aria-label={actionsLabel} className="mt-6 flex flex-wrap gap-2">
            {actions.map((a, i) => (
              <Link
                key={a.href}
                href={a.href}
                className={i === 0
                  ? "inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-navy shadow-raised outline-none transition-transform hover:-translate-y-0.5 focus-visible:ring-3 focus-visible:ring-white/60"
                  : "inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-medium ring-1 ring-white/20 backdrop-blur-sm ring-inset outline-none transition-colors hover:bg-white/20 focus-visible:ring-3 focus-visible:ring-white/60"}
              >
                <Plus className="size-4" aria-hidden />{a.label}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </section>
  );
}
