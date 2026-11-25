import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { JobView } from "./job-view";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).sol.job };
}

export default function JobPage({ params }: PageProps<"/sol/jobs/[id]">) {
  return <JobView params={params} area="jobs" />;
}
