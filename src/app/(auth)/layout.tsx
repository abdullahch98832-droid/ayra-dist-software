import { Boxes, Factory, Landmark, ShoppingCart, Truck, Users } from "lucide-react";
import { getT } from "@/i18n/server";
import { RouteLines } from "@/components/layout/route-lines";
import { Brand } from "@/components/layout/brand";
import { Footer } from "@/components/layout/footer";
import { LanguageMenu } from "@/components/layout/language-menu";

const AREAS = [
  { key: "sales", icon: ShoppingCart }, { key: "procurement", icon: Factory }, { key: "stock", icon: Boxes }, { key: "sol", icon: Truck }, { key: "finance", icon: Landmark }, { key: "people", icon: Users },
] as const;

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getT();
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="grid flex-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <aside className="bg-brand relative hidden overflow-hidden text-white lg:flex lg:flex-col lg:gap-8 lg:p-12">
          <span aria-hidden className="dotted pointer-events-none absolute inset-0 text-white/10 [mask-image:radial-gradient(60%_60%_at_50%_45%,black,transparent)]" />
          <Brand subtitle={t.common.subtitle} tone="white" size="lg" className="relative" />
          <div className="relative -mx-12 min-h-40 flex-1"><RouteLines className="absolute inset-0 size-full" /></div>
          <div className="relative max-w-lg">
            <p className="font-heading text-3xl leading-tight text-balance xl:text-4xl">{t.auth.brandHeadline}</p>
            <p className="mt-4 text-base text-white/80">{t.auth.brandText}</p>
            <ul className="mt-7 flex flex-wrap gap-2 text-sm">
              {AREAS.map(({ key, icon: Icon }) => (
                <li key={key} className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 ring-1 ring-white/15 ring-inset"><Icon className="size-4 text-[#a9c5ff]" aria-hidden />{t.nav.groups[key]}</li>
              ))}
            </ul>
          </div>
        </aside>
        <div className="flex min-w-0 flex-col bg-[radial-gradient(46rem_30rem_at_100%_0%,color-mix(in_srgb,var(--primary)_12%,transparent),transparent)]">
          <header className="flex items-center justify-between gap-4 px-4 py-4 sm:px-8">
            <Brand subtitle={t.common.subtitle} className="lg:invisible" />
            <LanguageMenu compact />
          </header>
          <main className="flex flex-1 items-center justify-center px-4 py-8 sm:px-8">
            <div className="w-full max-w-md">{children}</div>
          </main>
        </div>
      </div>
      <Footer />
    </div>
  );
}
