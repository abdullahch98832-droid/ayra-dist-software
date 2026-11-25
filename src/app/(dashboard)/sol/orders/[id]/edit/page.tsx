import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { EditView } from "../../../jobs/[id]/edit/edit-view";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).distributor.edit };
}

export default function EditDistributorOrderPage({ params }: PageProps<"/sol/orders/[id]/edit">) {
  return <EditView params={params} area="orders" />;
}
