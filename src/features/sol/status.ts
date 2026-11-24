import type { Dictionary } from "@/i18n";
import type { BadgeTone } from "@/components/shared/status-badge";

export const JOB_STATUSES = ["draft", "confirmed", "in_progress", "completed", "cancelled"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
export const OPEN_JOB_STATUSES: JobStatus[] = ["confirmed", "in_progress"];
export const isOpenJob = (status: string) => (OPEN_JOB_STATUSES as string[]).includes(status);

export const JOB_TONE: Record<string, BadgeTone> = { draft: "gray", confirmed: "blue", in_progress: "amber", completed: "green", cancelled: "gray" };
export const VEHICLE_TONE: Record<string, BadgeTone> = { active: "green", maintenance: "amber", out_of_service: "red", retired: "gray" };
const DELIVERY_TONE: Record<string, BadgeTone> = { draft: "blue", dispatched: "amber", delivered: "green", cancelled: "gray" };

const options = (labels: Record<string, string>, tones: Record<string, BadgeTone>) =>
  Object.fromEntries(Object.entries(labels).map(([key, label]) => [key, { label, tone: tones[key] ?? ("gray" as const) }]));
export const jobOptions = (t: Dictionary) => options(t.sol.statuses, JOB_TONE);
export const solDeliveryOptions = (t: Dictionary) => options(t.sol.deliveryStatuses, DELIVERY_TONE);
export const vehicleOptions = (t: Dictionary) => options(t.vehicles.statuses, VEHICLE_TONE);
