"use client";

import { Languages } from "lucide-react";
import { useI18n } from "@/i18n/context";
import { LOCALES } from "@/types";
import { Button } from "@/components/ui/button";

export function LocaleSwitcher() {
  const { locale, setLocale, switching, t } = useI18n();
  const target = locale === "en" ? "ur" : "en";

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => setLocale(target)}
      disabled={switching}
      aria-label={t.common.switchLanguage}
      className="gap-2"
    >
      <Languages className="h-4 w-4" />
      <span lang={target}>{LOCALES[target].nativeLabel}</span>
    </Button>
  );
}
