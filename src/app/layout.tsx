import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Marcellus, Noto_Nastaliq_Urdu } from "next/font/google";
import { Providers } from "@/components/providers";
import { APP_CONFIG } from "@/config/app";
import { LOCALES } from "@/types";
import { getLocale, getT } from "@/i18n/server";
import "./globals.css";

const geistSans = Geist({ subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], preload: false });
const marcellus = Marcellus({ subsets: ["latin"], weight: "400" });
const nastaliq = Noto_Nastaliq_Urdu({ subsets: ["arabic"], weight: ["400", "500", "600", "700"] });

/**
 * Only the real face of each font. next/font appends a metric-matched "… Fallback" (Arial
 * or Times), which has Arabic letters and would draw Urdu before Nastaliq is reached.
 */
const face = (font: { style: { fontFamily: string } }) => font.style.fontFamily.split(",")[0] ?? "sans-serif";
const FONT_FACES = {
  "--face-sans": face(geistSans),
  "--face-heading": face(marcellus),
  "--face-urdu": face(nastaliq),
} as React.CSSProperties;

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
      className={`${geistMono.variable} h-full antialiased`}
      style={FONT_FACES}
    >
      <body className="flex min-h-full flex-col">
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
