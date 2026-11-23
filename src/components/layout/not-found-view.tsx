import { FileQuestion } from "lucide-react";
import { getT } from "@/i18n/server";
import { LinkButton } from "@/components/shared/link-button";
import { EmptyState } from "@/components/shared/states";

export async function NotFoundView() {
  const t = await getT();
  return (
    <EmptyState
      icon={FileQuestion}
      headingLevel="h1"
      title={t.states.notFoundTitle}
      description={t.states.notFoundHint}
      actions={<LinkButton href="/dashboard">{t.states.goHome}</LinkButton>}
    />
  );
}
