import { describe, expect, it } from "vitest";
import { sessionTimeoutReason } from "./session-timeout";

const limits = { idleMs: 30 * 60_000, absoluteMs: 12 * 3_600_000 };
const now = Date.UTC(2026, 10, 24, 12);

describe("sessionTimeoutReason", () => {
  it("keeps an active session", () => {
    expect(sessionTimeoutReason(now, now - 60_000, now - 3_600_000, limits)).toBeNull();
  });

  it("ends a session idle for longer than the limit", () => {
    expect(sessionTimeoutReason(now, now - 31 * 60_000, now - 3_600_000, limits)).toBe("idle");
  });

  it("ends a session older than the absolute limit even when active", () => {
    expect(sessionTimeoutReason(now, now - 1000, now - 13 * 3_600_000, limits)).toBe("expired");
  });

  it("treats missing cookies as a fresh session", () => {
    expect(sessionTimeoutReason(now, Number(undefined), Number(undefined), limits)).toBeNull();
  });
});
