import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Dataset } from "@/lib/domain/schemas";
import { calendarHeading, calendarState, FALLBACK_S_TALLY, formatCountdown, formatInZone, IST, LOCKOUT_TEXT, maxSettleSeconds, resolveSchedule, SETTLED_HEADING } from "@/lib/vote/calendar";
import { calendarView } from "@/lib/vote/view-data";
import { unavailableVote } from "@/lib/vote/manifest";
import { askDeltas, recordFundingView, VISIT_GAP_MS, WorkspaceSchema, type FundingVisits } from "@/components/workspace/schema";

const d = JSON.parse(readFileSync(path.join(process.cwd(), "data", "published", "dataset.json"), "utf8")) as Dataset;

const S = Date.parse("2026-12-03T21:00:00Z");
const schedule = { scheduleAvailable: true, schedule: { opensAt: 1794944075, firstTallyAt: [1796331600, 1796677200, 1796850000], initialWindow: 86400, maxWindows: 9 }, closesAt: 1797022462 };

const originalTz = process.env.TZ;
afterEach(() => {
  process.env.TZ = originalTz;
});

describe("schedule source", () => {
  it("uses the live manifest firstTallyAt[0] for the S-tier tally", () => {
    const s = resolveSchedule(d.vote);
    expect(d.vote.scheduleAvailable).toBe(true);
    expect(s.fallback).toBe(false);
    expect(s.tallies[0]).toBe(d.vote.schedule!.firstTallyAt[0]! * 1000);
    expect(s.tallies[1]).toBe(d.vote.schedule!.firstTallyAt[1]! * 1000);
    expect(s.tallies[2]).toBe(d.vote.schedule!.firstTallyAt[2]! * 1000);
    expect(s.settledBy).toBe(d.vote.closesAt! * 1000);
    expect(calendarView(d).schedule.fallback).toBe(false);
  });

  it("falls back to 3, 7 and 9 Dec 2026 21:00 UTC only when the schedule is missing, and flags it", () => {
    const s = resolveSchedule(unavailableVote("test"));
    expect(s.fallback).toBe(true);
    expect(s.tallies.map((t) => new Date(t!).toISOString())).toEqual(["2026-12-03T21:00:00.000Z", "2026-12-07T21:00:00.000Z", "2026-12-09T21:00:00.000Z"]);
    expect(s.tallies[0]).toBe(Date.parse(FALLBACK_S_TALLY));
    expect(new Date(s.settledBy!).toISOString()).toBe("2026-12-11T21:00:00.000Z");
    expect(s.settleWithinHours).toBe(48);
    // A present but invalid schedule also falls back.
    expect(resolveSchedule({ ...schedule, scheduleAvailable: false }).fallback).toBe(true);
  });

  it("the fallback times equal the live manifest times (same post, same round)", () => {
    const fb = resolveSchedule(unavailableVote("test"));
    expect(fb.tallies).toEqual(resolveSchedule(schedule).tallies);
    // The fallback settled time is B + 48 h; the manifest close is B + the halving windows, slightly earlier.
    expect(fb.settledBy!).toBeGreaterThanOrEqual(resolveSchedule(schedule).settledBy!);
  });
});

describe("fallback calendar after the S-tier tally (review v1)", () => {
  const fb = resolveSchedule(unavailableVote("test"));
  it("moves on to the A-tier and B-tier fallback tallies instead of claiming all have started", () => {
    const afterS = calendarState(fb, S + 60_000);
    expect(afterS).toMatchObject({ phase: "tallying", next: 1 });
    expect(calendarHeading(fb, afterS)).toBe("A-tier first tally");
    const afterA = calendarState(fb, Date.parse("2026-12-07T21:00:00Z") + 1);
    expect(calendarHeading(fb, afterA)).toBe("B-tier first tally");
    const afterB = calendarState(fb, Date.parse("2026-12-09T21:00:00Z") + 1);
    expect(calendarHeading(fb, afterB)).toBe("All tier tallies have started");
  });
  it("reaches the settled state after 11 Dec 21:00 UTC", () => {
    expect(calendarState(fb, Date.parse("2026-12-11T20:59:59Z")).phase).toBe("tallying");
    const settled = calendarState(fb, Date.parse("2026-12-11T21:00:00Z"));
    expect(settled.phase).toBe("settled");
    expect(calendarHeading(fb, settled)).toBe(SETTLED_HEADING);
  });
  it("never claims all tallies started when a later time is unknown", () => {
    const partial = { ...fb, tallies: [fb.tallies[0], null, null] as [number, null, null], settledBy: null };
    expect(calendarHeading(partial, calendarState(partial, S + 1))).toBe("Later tally times unavailable");
  });
});

describe("settle window", () => {
  it("is computed from the manifest tally windows, not hard-coded", () => {
    expect(maxSettleSeconds(86400, 9)).toBe(172462.5);
    expect(resolveSchedule(schedule).settleWithinHours).toBe(48);
    expect(resolveSchedule({ ...schedule, schedule: { ...schedule.schedule, initialWindow: 3600, maxWindows: 2 } }).settleWithinHours).toBe(2);
    // The manifest close is the B-tier tally plus the full windows (floored to the second).
    expect(1797022462 - 1796850000).toBe(Math.floor(maxSettleSeconds(86400, 9)));
  });
});

describe("countdown", () => {
  const s = resolveSchedule(schedule);
  it("counts down to the S-tier tally, floored to the minute", () => {
    const now = S - (6 * 86400 + 7 * 3600 + 42 * 60 + 59) * 1000;
    const st = calendarState(s, now);
    expect(st).toMatchObject({ phase: "before_s", next: 0 });
    expect(formatCountdown(st.remainingMs!)).toBe("6d 07h 42m");
    expect(formatCountdown(59_999)).toBe("0m");
    expect(formatCountdown(3_600_000)).toBe("1h 00m");
  });
  it("moves to the A-tier then B-tier tally after the S-tier tally starts", () => {
    expect(calendarState(s, S)).toMatchObject({ phase: "tallying", next: 1 });
    expect(calendarState(s, 1796677200 * 1000)).toMatchObject({ phase: "tallying", next: 2 });
    expect(calendarState(s, 1796850000 * 1000)).toMatchObject({ phase: "tallying", next: null, remainingMs: null });
  });
  it("switches to the settled state at the manifest close, keeping the history", () => {
    expect(calendarState(s, 1797022462 * 1000 - 1).phase).toBe("tallying");
    expect(calendarState(s, 1797022462 * 1000)).toEqual({ phase: "settled", next: null, remainingMs: null });
    expect(SETTLED_HEADING).toBe("Results and community funding until 31 Jan 2027");
    expect(LOCKOUT_TEXT).toBe("No ballot by the S-tier tally can lock you out of the round.");
  });
  it("gives the same remaining time whatever the viewer's zone", () => {
    const now = Date.parse("2026-11-26T12:00:00Z");
    const results = ["Asia/Kolkata", "UTC", "America/Los_Angeles"].map((tz) => {
      process.env.TZ = tz;
      return formatCountdown(calendarState(s, now).remainingMs!);
    });
    expect(new Set(results).size).toBe(1);
    expect(results[0]).toBe("7d 09h 00m");
  });
});

describe("time-zone formatting", () => {
  const cases = [
    { tz: "Asia/Kolkata", local: "Fri, Dec 4, 2026, 02:30 GMT+5:30" },
    { tz: "UTC", local: "Thu, Dec 3, 2026, 21:00 UTC" },
    { tz: "America/Los_Angeles", local: "Thu, Dec 3, 2026, 13:00 PST" },
  ];
  for (const c of cases) {
    it(`renders the viewer's local time, UTC and IST with TZ=${c.tz}`, () => {
      process.env.TZ = c.tz;
      expect(formatInZone(S)).toBe(c.local);
      expect(formatInZone(S, "UTC")).toBe("Thu, Dec 3, 2026, 21:00 UTC");
      expect(formatInZone(S, IST)).toBe("Fri, Dec 4, 2026, 02:30 GMT+5:30");
      expect(formatInZone(S, "America/Los_Angeles")).toBe("Thu, Dec 3, 2026, 13:00 PST");
    });
  }
});

describe("since last visit", () => {
  const v1 = { datasetVersion: "v1", asks: { a: 100_00, b: 200_00, c: null } };
  const t0 = new Date("2026-11-20T10:00:00Z");
  it("shows nothing on the first visit", () => {
    const f = recordFundingView({ seen: null, baseline: null }, v1, t0);
    expect(f.baseline).toBeNull();
    expect(askDeltas(f.baseline, v1.asks)).toEqual([]);
  });
  it("reports only real changes after a new visit starts", () => {
    let f: FundingVisits = recordFundingView({ seen: null, baseline: null }, v1, t0);
    const v2 = { datasetVersion: "v2", asks: { a: 90_00, b: 200_00, c: 50_00, d: 10_00 } };
    f = recordFundingView(f, v2, new Date(t0.getTime() + VISIT_GAP_MS + 1));
    expect(f.baseline?.datasetVersion).toBe("v1");
    // a went down; b unchanged; c was unavailable before; d is new: only a is a real change.
    expect(askDeltas(f.baseline, v2.asks)).toEqual([{ id: "a", beforeCents: 100_00, afterCents: 90_00, deltaCents: -10_00 }]);
    // A reload within the same visit keeps the same baseline, so the delta stays visible.
    const again = recordFundingView(f, v2, new Date(t0.getTime() + VISIT_GAP_MS + 60_000));
    expect(again.baseline).toEqual(f.baseline);
    // The next visit with no change reports nothing.
    const later = recordFundingView(again, v2, new Date(t0.getTime() + 3 * VISIT_GAP_MS));
    expect(askDeltas(later.baseline, v2.asks)).toEqual([]);
  });
  it("persists inside the workspace entry and parses older workspaces", () => {
    const w = WorkspaceSchema.parse({ version: 1 });
    expect(w.funding).toEqual({ seen: null, baseline: null });
    expect(w.ballotDraft).toBeNull();
  });
});
