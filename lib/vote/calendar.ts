/**
 * Vote Calendar (pure, browser-safe). Tally times come from the official vote manifest
 * (schedule.firstTallyAt, unix seconds, in S, A, B order). Only when the manifest schedule is
 * unavailable does the S-tier time fall back to FALLBACK_S_TALLY, and the result says so.
 *
 * Dates that are not in the manifest (when results are final, community funding) are quoted
 * from TheDAO's 17 Nov 2026 voting post and labelled as such where shown.
 */
import type { VoteSection } from "@/lib/domain/schemas";

/** Documented fallback: S-tier first tally, Thu 3 Dec 2026, 21:00 UTC (TheDAO voting post). */
export const FALLBACK_S_TALLY = "2026-12-03T21:00:00Z";
export const VOTE_APP_URL = "https://initiatives.thedao.fund/vote";
export const VOTING_POST_URL = "https://paragraph.com/@thedao.fund/voting-is-live-which-security-initiatives-will-make-s-tier";
export const LOCKOUT_TEXT = "No ballot by the S-tier tally can lock you out of the round.";
export const REVISE_TEXT = "Ballots can be revised until their tier settles.";
export const SETTLED_HEADING = "Results and community funding until 31 Jan 2027";
export const FALLBACK_LABEL = "Fallback time, manifest unavailable";
/** From the voting post: results final by these dates, and community funding afterwards. */
export const POST_DATES = { results: "Results by 5, 9 and 11 Dec", community: "Community funding until 31 Jan 2027" } as const;

export const IST = "Asia/Kolkata";

export interface VoteSchedule {
  /** S, A, B first tally times in ms; A and B are null without the manifest schedule. */
  tallies: [number, number | null, number | null];
  /** When every tier has settled at the latest (manifest closesAt), ms; null without it. */
  settledBy: number | null;
  /** True when the S-tier time is the hard-coded fallback. */
  fallback: boolean;
}

export function resolveSchedule(v: Pick<VoteSection, "scheduleAvailable" | "schedule" | "closesAt">): VoteSchedule {
  const t = v.scheduleAvailable ? v.schedule?.firstTallyAt : undefined;
  if (t && t.length >= 3 && t[0] !== undefined) {
    return { tallies: [t[0] * 1000, (t[1] as number) * 1000, (t[2] as number) * 1000], settledBy: v.closesAt !== null ? v.closesAt * 1000 : null, fallback: false };
  }
  return { tallies: [Date.parse(FALLBACK_S_TALLY), null, null], settledBy: null, fallback: true };
}

export type Phase = "before_s" | "tallying" | "settled";

export interface CalendarState {
  phase: Phase;
  /** Next tally that has not started yet: 0 = S, 1 = A, 2 = B; null when none is known. */
  next: number | null;
  /** ms until the next tally (never negative). */
  remainingMs: number | null;
}

export function calendarState(s: VoteSchedule, nowMs: number): CalendarState {
  if (s.settledBy !== null && nowMs >= s.settledBy) return { phase: "settled", next: null, remainingMs: null };
  const next = s.tallies.findIndex((t) => t !== null && nowMs < t);
  const at = next >= 0 ? s.tallies[next] : null;
  return { phase: nowMs < s.tallies[0] ? "before_s" : "tallying", next: next >= 0 ? next : null, remainingMs: at !== null && at !== undefined ? at - nowMs : null };
}

/** "6d 07h 42m", or "42m" in the last hour. Floors to the minute so it never overstates. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 60_000));
  const d = Math.floor(total / 1440);
  const h = Math.floor((total % 1440) / 60);
  const m = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (d > 0) return `${d}d ${pad(h)}h ${pad(m)}m`;
  if (h > 0) return `${h}h ${pad(m)}m`;
  return `${m}m`;
}

/**
 * Date and time in a time zone, with the zone abbreviation. `timeZone` undefined means the
 * viewer's own zone (the runtime default).
 */
export function formatInZone(ms: number, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone, timeZoneName: "short" }).format(ms);
}

export const TIER_NAMES = ["S-tier", "A-tier", "B-tier"] as const;
