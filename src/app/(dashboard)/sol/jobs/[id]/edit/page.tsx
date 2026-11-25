import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { EditView } from "./edit-view";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).sol.editJob };
}

export default function EditJobPage({ params }: PageProps<"/sol/jobs/[id]/edit">) {
  return <EditView params={params} area="jobs" />;
}
