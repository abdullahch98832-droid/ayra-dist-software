export const APP_CONFIG = {
  name: "AYRA HAPPINESS",
  subtitle: "Distribution Management System",
  shortName: "AYRA DMS",
  version: "0.1.0",
  /** Business days start and end at midnight in Pakistan; keep in step with private.business_today(). */
  timeZone: "Asia/Karachi",
  defaultLocale: "en" as const,
  supportedLocales: ["en", "ur"] as const,
  developer: {
    name: "Webcore Solutions",
    logo: "/branding/webcore-solutions-logo.png",
  },
} as const;
