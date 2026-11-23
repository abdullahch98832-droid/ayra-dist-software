import type { BadgeTone } from "@/components/shared/status-badge";
import type { EmploymentStatus } from "@/lib/validation/employees";

export const EMPLOYEE_STATUS_TONE: Record<EmploymentStatus, BadgeTone> = { active: "green", on_leave: "amber", terminated: "gray" };
