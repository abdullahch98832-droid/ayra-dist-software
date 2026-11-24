import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadTakers, takerPhotos } from "@/features/takers/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { PhotoUploader } from "../../../employees/photo-uploader";
import { TakerForm } from "../../taker-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).takers.edit };
}

export default async function EditTakerPage({ params }: PageProps<"/order-takers/[id]/edit">) {
  const { id, ctx, t, local } = await pageContext(params);
  if (!can(ctx, "sales.team")) return <Forbidden />;
  const taker = (await loadTakers()).find((x) => x.id === id);
  if (!taker) notFound();
  const photos = await takerPhotos([taker]);
  const canEditEmployee = can(ctx, "employees.manage");
  return (
    <>
      <PageHeader title={t.takers.edit} breadcrumbs={[{ label: t.takers.title, href: "/order-takers" }, { label: local(taker.nameEn, taker.nameUr), href: `/order-takers/${id}` }]} />
      <div className="grid max-w-4xl gap-6">
        <PhotoUploader employeeId={id} name={taker.nameEn} url={photos.get(taker.photoPath ?? "")} canEdit={canEditEmployee} />
        <TakerForm
          existing employees={[]} canEditEmployee={canEditEmployee}
          defaults={{
            employeeId: id, editEmployee: canEditEmployee, name: taker.nameEn, nameUr: taker.nameUr ?? "", phone: taker.phone ?? "", whatsapp: taker.whatsapp ?? "", status: taker.status,
            territory: taker.territory ?? "", isActive: taker.isActive || taker.status === "terminated", notes: taker.notes ?? "",
          }}
        />
      </div>
    </>
  );
}
