import type { Permission } from "@/lib/auth/permissions";

/** The two procurement workflows: the main company and external suppliers. */
export const FLOWS = ["company", "suppliers"] as const;
export type Flow = (typeof FLOWS)[number];

export function isFlow(value: string): value is Flow {
  return (FLOWS as readonly string[]).includes(value);
}
export const isPrincipal = (flow: Flow) => flow === "company";
export const flowOf = (principal: boolean): Flow => (principal ? "company" : "suppliers");
export const flowPath = (flow: Flow, ...parts: string[]) => ["/purchasing", flow, ...parts].join("/");
export const accountView = (flow: Flow): Permission => (flow === "company" ? "company.view" : "payables.view");
export const accountPay = (flow: Flow): Permission => (flow === "company" ? "company.pay" : "payables.pay");
/** Who may open the workflow at all. */
export const FLOW_ACCESS: Record<Flow, Permission[]> = {
  company: ["purchasing.view", "purchasing.create", "company.view"],
  suppliers: ["purchasing.view", "purchasing.create", "payables.view"],
};
