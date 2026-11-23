import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Marcellus, Noto_Nastaliq_Urdu } from "next/font/google";
import { Providers } from "@/components/providers";
import { APP_CONFIG } from "@/config/app";
import { LOCALES } from "@/types";
import { getLocale, getT } from "@/i18n/server";
import "./globals.css";

// Fallback faces are disabled: "Geist Fallback" is Arial, which would draw Urdu before
// the browser ever reaches Nastaliq.
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"], adjustFontFallback: false });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], preload: false });
const marcellus = Marcellus({ variable: "--font-marcellus", subsets: ["latin"], weight: "400", adjustFontFallback: false });
const nastaliq = Noto_Nastaliq_Urdu({
  variable: "--font-urdu",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  adjustFontFallback: false,
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: { default: `${APP_CONFIG.name} — ${t.common.subtitle}`, template: `%s · ${APP_CONFIG.name}` },
    description: t.common.subtitle,
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = { themeColor: "#ffffff" };

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      dir={LOCALES[locale].direction}
      className={`${geistSans.variable} ${geistMono.variable} ${marcellus.variable} ${nastaliq.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
