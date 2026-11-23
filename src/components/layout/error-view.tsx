"use client";

import { useEffect } from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { useI18n } from "@/i18n/context";
import { Ltr } from "@/components/shared/bidi";
import { LinkButton } from "@/components/shared/link-button";
import { EmptyState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";

/** Body of every error.tsx. Server messages are never shown, only the reference to look up in the logs. */
export function ErrorView({ error, retry }: { error: unknown; retry: () => void }) {
  const { t } = useI18n();
  useEffect(() => console.error(error), [error]);
  const digest = error && typeof error === "object" && "digest" in error ? String(error.digest) : null;
  return (
    <EmptyState
      icon={TriangleAlert}
      tone="danger"
      headingLevel="h1"
      title={t.states.errorTitle}
      description={t.states.errorHint}
      actions={
        <>
          <Button onClick={retry}><RotateCcw aria-hidden />{t.common.retry}</Button>
          <LinkButton variant="outline" href="/dashboard">{t.states.goHome}</LinkButton>
        </>
      }
    >
      {digest && <p className="text-xs text-muted-foreground">{t.states.errorReference}: <Ltr className="font-mono">{digest}</Ltr></p>}
    </EmptyState>
  );
}
