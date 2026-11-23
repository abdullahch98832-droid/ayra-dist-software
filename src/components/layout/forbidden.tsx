import { ShieldAlert } from "lucide-react";
import { getT } from "@/i18n/server";
import { LinkButton } from "@/components/shared/link-button";
import { EmptyState } from "@/components/shared/states";

export async function Forbidden() {
  const t = await getT();
  return (
    <EmptyState
      icon={ShieldAlert}
      tone="warning"
      headingLevel="h1"
      title={t.states.forbiddenTitle}
      description={t.states.forbiddenHint}
      actions={<LinkButton variant="outline" href="/profile">{t.profile.title}</LinkButton>}
    />
  );
}
