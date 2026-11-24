"use client";

import { useEffect } from "react";
import { DatabaseZap, RotateCcw, TriangleAlert } from "lucide-react";
import { useI18n } from "@/i18n/context";
import { Ltr } from "@/components/shared/bidi";
import { LinkButton } from "@/components/shared/link-button";
import { EmptyState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { useDatabaseUpdate } from "./database-update";

/** Body of every error.tsx. Server messages are never shown, only the reference to look up in the logs. */
export function ErrorView({ error, retry }: { error: unknown; retry: () => void }) {
  const { t } = useI18n();
  const update = useDatabaseUpdate();
  useEffect(() => console.error(error), [error]);
  const digest = error && typeof error === "object" && "digest" in error ? String(error.digest) : null;
  return (
    <EmptyState
      icon={update.needed ? DatabaseZap : TriangleAlert}
      tone={update.needed ? "warning" : "danger"}
      headingLevel="h1"
      title={update.needed ? t.states.updatePageTitle : t.states.errorTitle}
      description={update.needed ? (update.admin ? t.states.updatePageHint : t.states.updateUserHint) : t.states.errorHint}
      actions={
        <>
          <Button onClick={update.needed ? () => window.location.reload() : retry}><RotateCcw aria-hidden />{update.needed ? t.states.checkAgain : t.common.retry}</Button>
          <LinkButton variant="outline" href="/dashboard">{t.states.goHome}</LinkButton>
        </>
      }
    >
      {digest && <p className="text-xs text-muted-foreground">{t.states.errorReference}: <Ltr className="font-mono">{digest}</Ltr></p>}
    </EmptyState>
  );
}
