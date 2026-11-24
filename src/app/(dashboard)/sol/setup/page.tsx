import type { Metadata } from "next";
import { loadJobTypes, loadServices } from "@/features/sol/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { ServiceEditor, TypeEditor } from "./editors";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).sol.tabs.setup };
}

export default async function SolSetupPage() {
  const { ctx, t } = await pageContext();
  if (!can(ctx, "sol.manage")) return <Forbidden />;
  const [types, services] = await Promise.all([loadJobTypes(), loadServices()]);
  return (
    <>
      <PageHeader title={t.sol.tabs.setup} description={t.sol.setupHint} />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <TypeEditor items={types} />
        <ServiceEditor items={services} />
      </div>
    </>
  );
}
