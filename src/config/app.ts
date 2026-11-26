export const APP_CONFIG = {
  /** The distributor's own name; Ayra Happiness is the company it buys from. */
  name: "AM TRADERS",
  subtitle: "Distributor Management System",
  shortName: "AM Traders DMS",
  logo: {
    /** The whole logo, transparent; it is made for a dark background. */
    full: "/branding/am-traders-logo.png",
    /** The AM monogram on navy, for small places and icons. */
    mark: "/branding/am-traders-mark.png",
  },
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
