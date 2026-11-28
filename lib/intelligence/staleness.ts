/** Official data older than this is flagged with a banner on every page. */
export const STALE_AFTER_HOURS = 12;

export type StaleInfo = { stale: boolean; ageHours: number | null };

export function staleInfo(officialGeneratedAt: string | null | undefined, now: Date = new Date()): StaleInfo {
  const t = officialGeneratedAt ? Date.parse(officialGeneratedAt) : NaN;
  // An unreadable timestamp cannot be shown to be fresh, so it is treated as stale.
  if (!Number.isFinite(t)) return { stale: true, ageHours: null };
  const ageHours = Math.max(0, (now.getTime() - t) / 3_600_000);
  return { stale: ageHours > STALE_AFTER_HOURS, ageHours };
}

const fmt = (timeZone: string, label: string) => {
  const f = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone });
  return (iso: string) => `${f.format(Date.parse(iso))} ${label}`;
};
const utc = fmt("UTC", "UTC");
const ist = fmt("Asia/Kolkata", "IST");

/** Last sync as UTC and India Standard Time (UTC+5:30). Local time is added in the browser. */
export function syncTimes(iso: string): { utc: string; ist: string } | null {
  if (!Number.isFinite(Date.parse(iso))) return null;
  return { utc: utc(iso), ist: ist(iso) };
}

export const STALE_HEADLINE = "Data may be out of date";
