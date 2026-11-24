import type { Dictionary } from "@/i18n";
import { StatusBadge, type BadgeTone } from "@/components/shared/status-badge";

const TONE: Record<string, BadgeTone> = {
  draft: "gray", approved: "blue", partially_received: "amber", received: "green", cancelled: "gray", posted: "green", void: "red",
};

export function DocumentStatus({ status, t, closed }: { status: string; t: Dictionary; closed?: boolean }) {
  const label = closed ? t.purchasing.closed : (t.purchasing.statuses as Record<string, string>)[status] ?? status;
  return <StatusBadge tone={closed ? "amber" : TONE[status] ?? "gray"}>{label}</StatusBadge>;
}
