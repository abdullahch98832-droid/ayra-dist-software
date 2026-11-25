import { APP_CONFIG } from "@/config/app";

export const PERIOD_PRESETS = ["today", "yesterday", "thisWeek", "thisMonth", "lastMonth", "thisYear", "last7", "last30", "last12Months", "custom"] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export interface Period {
  preset: PeriodPreset;
  /** Inclusive ISO dates. */
  from: string;
  to: string;
}

const DEFAULT: PeriodPreset = "thisMonth";
/** Same limit as dashboard_performance(). */
export const MAX_PERIOD_DAYS = 1100;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Today's date in Pakistan, matching private.business_today() in the database. */
export function businessToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_CONFIG.timeZone }).format(now);
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && ISO_DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);
}

function presetRange(preset: Exclude<PeriodPreset, "custom">, today: string): [string, string] {
  const monthStart = `${today.slice(0, 8)}01`;
  switch (preset) {
    case "today": return [today, today];
    case "yesterday": return [addDays(today, -1), addDays(today, -1)];
    // Weeks begin on Monday, years on 1 January.
    case "thisWeek": return [addDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7)), today];
    case "thisYear": return [`${today.slice(0, 4)}-01-01`, today];
    case "last7": return [addDays(today, -6), today];
    case "last30": return [addDays(today, -29), today];
    case "thisMonth": return [monthStart, today];
    case "lastMonth": {
      const end = addDays(monthStart, -1);
      return [`${end.slice(0, 8)}01`, end];
    }
    case "last12Months": {
      const [year, month] = today.split("-").map(Number) as [number, number];
      return [new Date(Date.UTC(year, month - 12, 1)).toISOString().slice(0, 10), today];
    }
  }
}

/** Reads the date filter from the URL. Anything invalid falls back to the current month. */
export function parsePeriod(params: Record<string, string | string[] | undefined>, today: string): Period {
  const preset = PERIOD_PRESETS.find((p) => p === params.range) ?? DEFAULT;
  if (preset === "custom") {
    const { from, to } = params;
    if (isIsoDate(from) && isIsoDate(to) && from <= to && daysBetween(from, to) <= MAX_PERIOD_DAYS) return { preset, from, to };
    const [f, t] = presetRange(DEFAULT as "thisMonth", today);
    return { preset: DEFAULT, from: f, to: t };
  }
  const [from, to] = presetRange(preset, today);
  return { preset, from, to };
}
