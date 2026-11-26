/**
 * Vote Calendar (pure, browser-safe). Tally times come from the official vote manifest
 * (schedule.firstTallyAt, unix seconds, in S, A, B order). Only when the manifest schedule is
 * unavailable do the times fall back to FALLBACK_TALLIES (3, 7 and 9 Dec 2026, 21:00 UTC) and the
 * settled state to FALLBACK_SETTLED_BY, and the result says so.
 *
 * Dates that are not in the manifest (when results are final, community funding) are quoted
 * from TheDAO's 17 Nov 2026 voting post and labelled as such where shown.
 */
import type { VoteSection } from "@/lib/domain/schemas";

/** Documented fallback: S-tier first tally, Thu 3 Dec 2026, 21:00 UTC (TheDAO voting post). */
export const FALLBACK_S_TALLY = "2026-12-03T21:00:00Z";
/**
 * Documented fallbacks for the A-tier (Mon 7 Dec) and B-tier (Wed 9 Dec) first tallies, at the
 * same 21:00 UTC as the S-tier, used only when the manifest schedule is unavailable.
 */
export const FALLBACK_TALLIES = [FALLBACK_S_TALLY, "2026-12-07T21:00:00Z", "2026-12-09T21:00:00Z"] as const;
/** The voting post: "A tier always settles within 48 hours of its first tally." */
export const FALLBACK_SETTLE_HOURS = 48;
/**
 * Fallback for "every tier has settled": the B-tier fallback tally plus 48 hours, 11 Dec 2026
 * 21:00 UTC (the post: B-tier "Results are final by Friday, December 11"). Used only without
 * the manifest; the manifest closesAt replaces it.
 */
export const FALLBACK_SETTLED_BY = "2026-12-11T21:00:00Z";
export const VOTE_APP_URL = "https://initiatives.thedao.fund/vote";
export const VOTING_POST_URL = "https://paragraph.com/@thedao.fund/voting-is-live-which-security-initiatives-will-make-s-tier";
export const LOCKOUT_TEXT = "No ballot by the S-tier tally can lock you out of the round.";
export const REVISE_TEXT = "Ballots can be revised until their tier settles.";
export const SETTLED_HEADING = "Results and community funding until 31 Jan 2027";
export const FALLBACK_LABEL = "Fallback times, manifest unavailable";
/** From the voting post: results final by these dates, and community funding afterwards. */
export const POST_DATES = { results: "Results by 5, 9 and 11 Dec", community: "Community funding until 31 Jan 2027" } as const;

export const IST = "Asia/Kolkata";

export interface VoteSchedule {
  /** S, A, B first tally times in ms. A and B are null only if a manifest schedule lacks them. */
  tallies: [number, number | null, number | null];
  /** When every tier has settled at the latest (manifest closesAt, or the fallback), ms. */
  settledBy: number | null;
  /** True when the times are the hard-coded fallbacks (manifest schedule unavailable). */
  fallback: boolean;
  /**
   * Longest time from a tier's first tally to its settlement, in whole hours rounded up: the sum of
   * the halving tally windows (initialWindow, initialWindow/2, ... for maxWindows windows). Without
   * the manifest schedule, the voting post's 48 hours.
   */
  settleWithinHours: number | null;
}

/** Sum of maxWindows halving windows starting at initialWindow seconds, in seconds. */
export function maxSettleSeconds(initialWindow: number, maxWindows: number): number {
  let total = 0;
  for (let i = 0, w = initialWindow; i < maxWindows; i++, w /= 2) total += w;
  return total;
}

export function resolveSchedule(v: Pick<VoteSection, "scheduleAvailable" | "schedule" | "closesAt">): VoteSchedule {
  const sch = v.scheduleAvailable ? v.schedule : null;
  const t = sch?.firstTallyAt;
  if (sch && t && t.length >= 3 && t[0] !== undefined) {
    return {
      tallies: [t[0] * 1000, (t[1] as number) * 1000, (t[2] as number) * 1000],
      settledBy: v.closesAt !== null ? v.closesAt * 1000 : null,
      fallback: false,
      settleWithinHours: Math.ceil(maxSettleSeconds(sch.initialWindow, sch.maxWindows) / 3600),
    };
  }
  const [s, a, b] = FALLBACK_TALLIES.map((x) => Date.parse(x)) as [number, number, number];
  return { tallies: [s, a, b], settledBy: Date.parse(FALLBACK_SETTLED_BY), fallback: true, settleWithinHours: FALLBACK_SETTLE_HOURS };
}

/** Heading of the strip for a state; null state means server render (before the clock is known). */
export function calendarHeading(s: VoteSchedule, state: CalendarState | null): string {
  if (state?.phase === "settled") return SETTLED_HEADING;
  if (state && state.next === null) return s.tallies.every((t) => t !== null) ? "All tier tallies have started" : "Later tally times unavailable";
  return `${TIER_NAMES[state?.next ?? 0]} first tally`;
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
