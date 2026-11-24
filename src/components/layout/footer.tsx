"use client";

import Image from "next/image";
import { APP_CONFIG } from "@/config/app";
import { useI18n } from "@/i18n/context";

export function Footer() {
  const { t } = useI18n();
  return (
    <footer className="border-t bg-card print:hidden">
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-3 text-sm text-muted-foreground">
        <span>
          {t.footer.developedBy} <bdi className="font-latin font-medium text-foreground">{t.footer.developerName}</bdi>
        </span>
        {/* unoptimized: the logo file is served exactly as supplied, never re-encoded. */}
        <Image src={APP_CONFIG.developer.logo} alt={APP_CONFIG.developer.name} width={2549} height={829} unoptimized className="h-8 w-auto" />
      </div>
    </footer>
  );
}
