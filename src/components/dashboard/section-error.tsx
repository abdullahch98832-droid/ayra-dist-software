"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { DatabaseZap, RotateCcw, TriangleAlert } from "lucide-react";
import { useI18n } from "@/i18n/context";
import { fill } from "@/i18n/format";
import { Ltr } from "@/components/shared/bidi";
import { EmptyState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";

export function SectionError({ name, outdated, reference }: { name: string; outdated: boolean; reference: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div role="alert">
      <EmptyState
        icon={outdated ? DatabaseZap : TriangleAlert}
        tone={outdated ? "warning" : "danger"}
        title={outdated ? t.dashboard.section.outdated : fill(t.dashboard.section.failed, { section: name })}
        description={outdated ? t.dashboard.section.outdatedHint : t.dashboard.section.failedHint}
        className="py-8"
        actions={
          <Button variant="outline" disabled={pending} onClick={() => startTransition(() => router.refresh())}>
            <RotateCcw aria-hidden />{pending ? t.common.processing : t.common.retry}
          </Button>
        }
      >
        {!outdated && <p className="text-xs text-muted-foreground">{t.states.errorReference}: <Ltr className="font-mono">{reference}</Ltr></p>}
      </EmptyState>
    </div>
  );
}
