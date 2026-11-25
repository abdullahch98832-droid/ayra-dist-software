import { redirect } from "next/navigation";
import { FLOW_ACCESS, FLOWS, flowPath, isFlow } from "@/features/purchasing/flow";
import { can, requireActiveSession } from "@/lib/auth/session";
import { Forbidden } from "@/components/layout/forbidden";

export default async function PurchasingPage() {
  const ctx = await requireActiveSession();
  const flow = FLOWS.find((f) => isFlow(f) && FLOW_ACCESS[f].some((p) => can(ctx, p)));
  if (!flow) return <Forbidden />;
  redirect(flowPath(flow));
}
