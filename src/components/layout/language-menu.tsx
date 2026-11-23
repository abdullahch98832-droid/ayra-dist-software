"use client";

import { Check, ChevronDown, Languages } from "lucide-react";
import { useI18n } from "@/i18n/context";
import { LOCALES, type Locale } from "@/types";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/** Switches language in place. The page is not reloaded, so form input is kept. */
export function LanguageMenu({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, switching, t } = useI18n();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" disabled={switching} className="gap-2 px-3" />} aria-label={`${t.common.switchLanguage}: ${LOCALES[locale].nativeLabel}`}>
        <Languages aria-hidden />
        <span lang={locale} className={compact ? "hidden md:inline" : undefined}>{LOCALES[locale].nativeLabel}</span>
        <ChevronDown className="opacity-60" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {(Object.keys(LOCALES) as Locale[]).map((code) => (
          <DropdownMenuItem key={code} onClick={() => code !== locale && setLocale(code)} aria-current={code === locale || undefined}>
            <span lang={code} dir={LOCALES[code].direction} className="flex-1 text-start">{LOCALES[code].nativeLabel}</span>
            {code === locale && <Check aria-hidden />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
