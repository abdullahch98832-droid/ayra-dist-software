import type { Metadata } from "next";
import { loadDocumentSettings } from "@/features/documents/data";
import { loadOverrideOn } from "@/features/inventory/queries";
import { getT } from "@/i18n/server";
import { can, requireActiveSession } from "@/lib/auth/session";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { DocumentSettings } from "./document-settings";
import { NegativeStockSetting } from "./negative-stock-setting";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).settings.title };
}

export default async function SettingsPage() {
  const ctx = await requireActiveSession();
  if (!can(ctx, "settings.manage")) return <Forbidden />;
  const t = await getT();
  const [enabled, documents] = await Promise.all([loadOverrideOn(), loadDocumentSettings()]);
  return (
    <>
      <PageHeader title={t.settings.title} description={t.settings.subtitle} />
      <div className="grid max-w-4xl gap-6">
        <SectionCard title={t.docs.settings.title} description={t.docs.settings.hint}>
          <DocumentSettings defaults={{
            company_address: documents.company_address, company_address_ur: documents.company_address_ur, company_phone: documents.company_phone, company_email: documents.company_email, company_ntn: documents.company_ntn,
            document_note: documents.document_note, document_note_ur: documents.document_note_ur,
          }} />
        </SectionCard>
        <SectionCard title={t.settings.inventory}><NegativeStockSetting enabled={enabled} /></SectionCard>
      </div>
    </>
  );
}
