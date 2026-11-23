export const AUTH_CONFIG = {
  /** Sign out after this long without any request. */
  idleTimeoutMinutes: 30,
  /** Sign out this long after sign-in, regardless of activity. */
  absoluteTimeoutHours: 12,
  activityCookie: "ayra_last_activity",
  sessionStartCookie: "ayra_session_started",
  loginPath: "/login",
  homePath: "/dashboard",
  noAccessPath: "/no-access",
  /** Reachable without a session. */
  publicPaths: ["/login", "/forgot-password", "/auth/confirm"],
} as const;
