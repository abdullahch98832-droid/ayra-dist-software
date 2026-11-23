"use client";

import Image from "next/image";
import { APP_CONFIG } from "@/config/app";
import { useI18n } from "@/i18n/context";

export function Footer() {
  const { t } = useI18n();

  return (
    <footer className="border-t bg-card">
      <div className="container mx-auto flex flex-wrap items-center justify-center gap-3 px-4 py-4 text-sm text-muted-foreground">
        <span>
          {t.footer.developedBy}{" "}
          <span className="font-latin font-medium text-foreground">
            {t.footer.developerName}
          </span>
        </span>
        <Image
          src={APP_CONFIG.developer.logo}
          alt={APP_CONFIG.developer.name}
          width={2549}
          height={829}
          className="h-7 w-auto"
        />
      </div>
    </footer>
  );
}
