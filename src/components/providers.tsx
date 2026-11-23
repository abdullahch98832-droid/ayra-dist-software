"use client";

import { DirectionProvider } from "@base-ui/react/direction-provider";
import { LOCALES, type Locale } from "@/types";
import { I18nProvider } from "@/i18n/context";
import { Toaster } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";

/** The tree must not change shape with the locale: remounting would discard unsaved form input. */
export function Providers({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return (
    <I18nProvider locale={locale}>
      <DirectionProvider direction={LOCALES[locale].direction}>
        <TooltipProvider>
          <Toaster>{children}</Toaster>
        </TooltipProvider>
      </DirectionProvider>
    </I18nProvider>
  );
}
