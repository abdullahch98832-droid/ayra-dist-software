export type TimeoutReason = "idle" | "expired";

/** Decides whether a session must end. Timestamps are epoch ms; missing values are NaN/0. */
export function sessionTimeoutReason(
  now: number,
  lastActivity: number,
  startedAt: number,
  limits: { idleMs: number; absoluteMs: number }
): TimeoutReason | null {
  if (lastActivity > 0 && now - lastActivity > limits.idleMs) return "idle";
  if (startedAt > 0 && now - startedAt > limits.absoluteMs) return "expired";
  return null;
}
