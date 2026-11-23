import { getT } from "@/i18n/server";
import { AuthArtwork } from "@/components/layout/auth-artwork";
import { Brand } from "@/components/layout/brand";
import { Footer } from "@/components/layout/footer";
import { LanguageMenu } from "@/components/layout/language-menu";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getT();
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="grid flex-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <aside className="relative hidden overflow-hidden bg-navy text-white lg:flex lg:flex-col lg:gap-8 lg:p-12">
          <Brand subtitle={t.common.subtitle} tone="white" size="lg" />
          <AuthArtwork className="-mx-12 h-0 min-h-0 w-[calc(100%+6rem)] flex-1" />
          <div className="max-w-md">
            <p className="font-heading text-3xl leading-tight text-balance xl:text-4xl">{t.auth.brandHeadline}</p>
            <p className="mt-4 text-base text-white/75">{t.auth.brandText}</p>
          </div>
        </aside>
        <div className="flex min-w-0 flex-col bg-card">
          <header className="flex items-center justify-between gap-4 px-4 py-4 sm:px-8">
            <Brand subtitle={t.common.subtitle} className="lg:invisible" />
            <LanguageMenu compact />
          </header>
          <main className="flex flex-1 items-center justify-center px-4 py-8 sm:px-8">
            <div className="w-full max-w-sm">{children}</div>
          </main>
        </div>
      </div>
      <Footer />
    </div>
  );
}
