"use client";

import { createContext, useContext } from "react";
import { DatabaseZap } from "lucide-react";
import { REQUIRED_MIGRATION } from "@/config/database";
import { useI18n } from "@/i18n/context";
import { Ltr } from "@/components/shared/bidi";
import { Button } from "@/components/ui/button";

export interface DatabaseUpdate {
  needed: boolean;
  /** Whether this user can do something about it. */
  admin: boolean;
}

const DatabaseUpdateContext = createContext<DatabaseUpdate>({ needed: false, admin: false });
export const DatabaseUpdateProvider = DatabaseUpdateContext.Provider;
export const useDatabaseUpdate = () => useContext(DatabaseUpdateContext);

/** Tells administrators that a migration is missing, instead of leaving pages to fail one by one. */
export function DatabaseUpdateBanner() {
  const { t } = useI18n();
  const { needed, admin } = useDatabaseUpdate();
  if (!needed || !admin) return null;
  return (
    <div role="status" className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning print:hidden">
      <DatabaseZap className="size-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 basis-64">
        <p className="font-medium">{t.states.updateTitle}</p>
        <p>{t.states.updateHint}</p>
        <Ltr className="mt-1 font-mono text-xs break-all">{REQUIRED_MIGRATION}</Ltr>
      </div>
      {/* A full reload: the layout that knows the answer is not rendered again by navigation. */}
      <Button variant="outline" onClick={() => window.location.reload()}>{t.states.checkAgain}</Button>
    </div>
  );
}
