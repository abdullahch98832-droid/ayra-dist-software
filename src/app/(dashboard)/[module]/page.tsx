import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NAV_ITEMS } from "@/config/navigation";
import { fill } from "@/i18n/format";
import { getT } from "@/i18n/server";
import { can, requireActiveSession } from "@/lib/auth/session";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { LinkButton } from "@/components/shared/link-button";
import { EmptyState } from "@/components/shared/states";

const plannedModule = (slug: string) => NAV_ITEMS.find((item) => item.planned && item.href === `/${slug}`);

export async function generateMetadata({ params }: PageProps<"/[module]">): Promise<Metadata> {
  const item = plannedModule((await params).module);
  return { title: item ? item.label(await getT()) : undefined };
}

/** Modules on the roadmap. A module's own folder takes over this route as soon as it exists. */
export default async function PlannedModulePage({ params }: PageProps<"/[module]">) {
  const ctx = await requireActiveSession();
  const item = plannedModule((await params).module);
  if (!item) notFound();
  if (!can(ctx, item.permission)) return <Forbidden />;
  const t = await getT();
  const title = item.label(t);
  return (
    <>
      <PageHeader title={title} />
      <EmptyState
        icon={item.icon}
        title={fill(t.states.plannedTitle, { module: title })}
        description={t.states.plannedHint}
        actions={<LinkButton variant="outline" href="/dashboard">{t.states.goHome}</LinkButton>}
      />
    </>
  );
}
