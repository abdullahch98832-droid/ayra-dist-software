import { APP_CONFIG } from "@/config/app";
import { getT } from "@/i18n/server";
import { Footer } from "@/components/layout/footer";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getT();
  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      <header className="flex justify-end px-4 py-4">
        <LocaleSwitcher />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-12 pt-4 sm:items-center">
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <p className="font-latin text-2xl font-bold tracking-tight text-navy">{APP_CONFIG.name}</p>
            <p className="text-sm text-muted-foreground">{t.common.subtitle}</p>
          </div>
          {children}
        </div>
      </main>
      <Footer />
    </div>
  );
}
