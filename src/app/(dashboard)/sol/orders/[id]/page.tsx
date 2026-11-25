import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { JobView } from "../../jobs/[id]/job-view";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).distributor.order };
}

export default function DistributorOrderPage({ params }: PageProps<"/sol/orders/[id]">) {
  return <JobView params={params} area="orders" />;
}
