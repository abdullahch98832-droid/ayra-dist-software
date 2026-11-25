import Link from "next/link";
import { ArrowRight, Banknote, ClipboardList, PackageCheck, PackagePlus, Phone, TrendingUp, Truck, Waypoints, type LucideIcon } from "lucide-react";
import type { Dictionary } from "@/i18n";
import type { Permission } from "@/lib/auth/permissions";
import { can, type SessionContext } from "@/lib/auth/session";
import { IconTile } from "@/components/shared/icon-tile";
import { SectionHeading } from "@/components/shared/section-heading";

type StepKey = "take" | "order" | "supply" | "pay" | "call" | "buy" | "send" | "profit";
interface Step { key: StepKey; icon: LucideIcon; href: string; open: readonly Permission[] }

const SHOPS: Step[] = [
  { key: "take", icon: PackageCheck, href: "/purchasing/company", open: ["purchasing.view", "purchasing.create", "company.view"] },
  { key: "order", icon: ClipboardList, href: "/sales/orders", open: ["sales.view", "sales.view_all"] },
  { key: "supply", icon: Truck, href: "/sales/deliveries", open: ["sales.view", "sales.view_all"] },
  { key: "pay", icon: Banknote, href: "/receivables", open: ["receivables.view"] },
];
const SOL: Step[] = [
  { key: "call", icon: Phone, href: "/sol/orders", open: ["sol.view"] },
  { key: "buy", icon: PackagePlus, href: "/purchasing/company/orders", open: ["purchasing.view", "purchasing.create"] },
  { key: "send", icon: Waypoints, href: "/sol/deliveries", open: ["sol.view"] },
  { key: "profit", icon: TrendingUp, href: "/reports/sol-orders", open: ["reports.view"] },
];

function Row({ title, steps, ctx, t }: { title: string; steps: Step[]; ctx: SessionContext; t: Dictionary }) {
  const text = t.distributor.flow.steps;
  return (
    <div className="grid gap-3">
      <h3 className="text-sm font-semibold text-primary">{title}</h3>
      <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map((s, i) => {
          const body = (
            <>
              <IconTile icon={s.icon} size="sm" />
              <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-navy">{text[s.key]}</span><span className="block text-xs text-muted-foreground">{text[`${s.key}Hint`]}</span></span>
              {i < steps.length - 1 && <ArrowRight aria-hidden className="hidden size-4 shrink-0 text-muted-foreground/50 xl:block rtl:-scale-x-100" />}
            </>
          );
          const classes = "flex h-full items-center gap-3 rounded-xl border bg-background/60 px-4 py-3";
          return <li key={s.key}>{s.open.some((p) => can(ctx, p)) ? <Link href={s.href} className={`${classes} lift outline-none focus-visible:ring-3 focus-visible:ring-ring/40`}>{body}</Link> : <div className={classes}>{body}</div>}</li>;
        })}
      </ol>
    </div>
  );
}

/** What the business is: a distributor between the Ayra company, the shops and the distributors of other cities. */
export function BusinessFlow({ ctx, t }: { ctx: SessionContext; t: Dictionary }) {
  const f = t.distributor.flow;
  return (
    <section aria-labelledby="business-flow" className="grid gap-5 rounded-2xl border bg-card p-5 shadow-card print:hidden">
      <SectionHeading id="business-flow" icon={Waypoints} title={f.title} description={f.note} />
      <Row title={f.shops} steps={SHOPS} ctx={ctx} t={t} />
      <Row title={f.sol} steps={SOL} ctx={ctx} t={t} />
    </section>
  );
}
