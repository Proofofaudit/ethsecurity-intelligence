/**
 * Item 3: the server re-reads the vote manifest at most once per 12 minutes, shared by all
 * visitors, and a broken or mismatched read never replaces a valid value. The fixture is the
 * manifest stored by the latest valid snapshot (npm run ingest).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { loadPublishedDataset } from "@/lib/db/file-store";
import type { Dataset } from "@/lib/domain/schemas";
import { ValidationFailure } from "@/lib/official/client";
import type { VoteManifest, VoteManifestResponse } from "@/lib/official/schemas";
import { HttpError } from "@/lib/util/http";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createLiveVote, LIVE_FIELDS, LIVE_TTL_MINUTES, LIVE_TTL_MS, liveVoteEnabled, overlayAllowed, rejectLive } from "@/lib/vote/live";
import { validateVote } from "@/research/publish";
import { resolveSchedule } from "@/lib/vote/calendar";
import { ballotView, calendarView } from "@/lib/vote/view-data";
import { latestValidSnapshot, readObject } from "@/research/store";

let d: Dataset;
let m: VoteManifest;

beforeAll(async () => {
  const s = await latestValidSnapshot();
  if (!s?.vote?.object) throw new Error("No snapshot with a vote manifest. Run npm run ingest.");
  m = (await readObject<VoteManifestResponse>(s.vote.object)).manifest;
  d = await loadPublishedDataset();
});

/** A fake clock and a scripted fetcher that counts calls. */
function harness(responses: (() => VoteManifestResponse)[]) {
  let t = Date.parse("2026-11-30T12:00:00Z");
  let calls = 0;
  const live = createLiveVote({
    enabled: () => true,
    now: () => t,
    fetcher: async () => {
      const r = responses[Math.min(calls, responses.length - 1)]!;
      calls++;
      return r();
    },
  });
  return { live, advance: (ms: number) => (t += ms), calls: () => calls };
}

const withPool = (poolUsd: string): VoteManifest => ({ ...structuredClone(m), poolUsd });

describe("live manifest cache", () => {
  it("uses a TTL inside 10 to 15 minutes", () => {
    expect(LIVE_TTL_MINUTES).toBeGreaterThanOrEqual(10);
    expect(LIVE_TTL_MINUTES).toBeLessThanOrEqual(15);
    expect(LIVE_TTL_MS).toBe(LIVE_TTL_MINUTES * 60_000);
  });

  it("reads once per TTL however many requests arrive, and shows the live pool", async () => {
    const h = harness([() => ({ manifest: withPool("700000000000") })]);
    const results = await Promise.all(Array.from({ length: 20 }, () => h.live.apply(d)));
    expect(h.calls()).toBe(1);
    for (const r of results) {
      expect(r.live.source).toBe("live");
      expect(r.dataset.vote.poolMicroUsd).toBe("700000000000");
      expect(r.dataset.vote.poolCents).toBe(70_000_000);
    }
    h.advance(LIVE_TTL_MS - 1);
    await h.live.apply(d);
    expect(h.calls()).toBe(1);
    h.advance(1);
    await h.live.apply(d);
    expect(h.calls()).toBe(2);
  });

  it("changes only pool and schedule; groups, goals and asks stay as published", async () => {
    const h = harness([() => ({ manifest: withPool("700000000000") })]);
    const { dataset } = await h.live.apply(d);
    expect(dataset.initiatives).toBe(d.initiatives);
    expect(dataset.vote.initiativeGroups).toEqual(d.vote.initiativeGroups);
    expect(dataset.vote.projects).toEqual(d.vote.projects);
    expect(dataset.vote.status).toBe(d.vote.status);
    expect(dataset.vote.fetchedAt).toBe(d.vote.fetchedAt);
    // The input dataset is not mutated.
    expect(d.vote.poolMicroUsd).toBe(m.poolUsd);
  });

  it("never replaces a valid read with a failed or broken one", async () => {
    const h = harness([
      () => ({ manifest: withPool("700000000000") }),
      () => {
        throw new HttpError("HTTP 503", "u", 503, 2);
      },
      () => {
        throw new ValidationFailure("shape changed", "u", ["poolUsd: Required"]);
      },
      () => ({ manifest: { ...withPool("1"), slugs: [...m.slugs].reverse() } }),
      () => ({ manifest: withPool("123.4") }),
    ]);
    const first = await h.live.apply(d);
    expect(first.live.source).toBe("live");
    for (let i = 0; i < 4; i++) {
      h.advance(LIVE_TTL_MS);
      const r = await h.live.apply(d);
      expect(r.live.source).toBe("live");
      expect(r.live.fetchedAt).toBe(first.live.fetchedAt);
      expect(r.dataset.vote.poolMicroUsd).toBe("700000000000");
      expect(r.live.error).toBeTruthy();
    }
    expect(h.calls()).toBe(5);
  });

  it("falls back to the snapshot when no valid read exists, and says why", async () => {
    const h = harness([
      () => {
        throw new HttpError("Request failed after 2 attempts: timeout", "u", null, 2);
      },
    ]);
    const r = await h.live.apply(d);
    expect(r.live.source).toBe("snapshot");
    expect(r.dataset).toBe(d);
    expect(r.live.error).toContain("timeout");
    // The failure is cached too: no retry before the TTL ends.
    await h.live.apply(d);
    expect(h.calls()).toBe(1);
  });

  it("rejects reads that do not align with the published cohort or have a bad schedule", () => {
    expect(rejectLive(m, d)).toBeNull();
    expect(rejectLive({ ...m, slugs: [...m.slugs].reverse() }, d)).toContain("alignment");
    expect(rejectLive({ ...m, projects: m.projects.map((p, i) => (i === 0 ? { ...p, goalUsd: "1000000" } : p)) }, d)).toContain("goal_by_index");
    expect(rejectLive({ ...m, schedule: { ...m.schedule, firstTallyAt: [m.schedule.firstTallyAt[1]!, m.schedule.firstTallyAt[0]!, m.schedule.firstTallyAt[2]!] } }, d)).toContain("schedule");
    expect(rejectLive(withPool("685303720001"), d)).toContain("cents");
  });

  it("a live schedule replaces a missing snapshot schedule, so the calendar leaves fallback mode", async () => {
    const noSchedule: Dataset = { ...d, vote: { ...d.vote, scheduleAvailable: false, schedule: null } };
    expect(resolveSchedule(noSchedule.vote).fallback).toBe(true);
    const h = harness([() => ({ manifest: structuredClone(m) })]);
    const { dataset, live } = await h.live.apply(noSchedule);
    const view = calendarView(dataset, live);
    expect(view.schedule.fallback).toBe(false);
    expect(view.liveSchedule).toBe(true);
    expect(view.manifestFetchedAt).toBe(live.fetchedAt);
  });

  it("never overlays a snapshot whose manifest is unavailable, so the publish invariant holds (review v2)", async () => {
    const unavailable: Dataset = {
      ...d,
      vote: { ...d.vote, status: "unavailable", statusReason: "Vote manifest not retrieved (HTTP 404).", groupsAvailable: false, scheduleAvailable: false, schedule: null, poolMicroUsd: null, poolCents: null, opensAt: null, closesAt: null, initiativeGroups: {} },
    };
    expect(overlayAllowed(unavailable.vote)).toBe(false);
    expect(overlayAllowed(d.vote)).toBe(true);
    expect(overlayAllowed({ ...d.vote, status: "unaligned" })).toBe(true);
    const h = harness([() => ({ manifest: withPool("700000000000") })]);
    const r = await h.live.apply(unavailable);
    expect(r.dataset).toBe(unavailable);
    expect(r.dataset.vote.poolCents).toBeNull();
    expect(r.dataset.vote.scheduleAvailable).toBe(false);
    expect(r.live.source).toBe("snapshot");
    expect(r.live.fields).toEqual([]);
    expect(r.live.note).toContain("no vote manifest");
    // TheDAO is not even asked: nothing could be shown.
    expect(h.calls()).toBe(0);
    expect(validateVote(r.dataset)).toEqual([]);
  });

  it("an overlaid section still passes the publish invariants for the vote section", async () => {
    const h = harness([() => ({ manifest: withPool("700000000000") })]);
    const { dataset } = await h.live.apply(d);
    expect(validateVote(dataset)).toEqual([]);
  });

  it("readAt comes from the live read; configRevision, fetchedAt and objectHash stay with the snapshot (review v2)", async () => {
    const liveRead: VoteManifest = { ...withPool("700000000000"), readAt: { block: 99_999_999, timestamp: 1_800_000_000 }, configRevision: "rev-live" };
    const h = harness([() => ({ manifest: liveRead })]);
    const { dataset, live } = await h.live.apply(d);
    expect(dataset.vote.readAt).toEqual({ block: 99_999_999, timestamp: 1_800_000_000 });
    expect(dataset.vote.configRevision).toBe(d.vote.configRevision);
    expect(dataset.vote.fetchedAt).toBe(d.vote.fetchedAt);
    expect(dataset.vote.objectHash).toBe(d.vote.objectHash);
    expect(live.fields).toEqual(LIVE_FIELDS);
    expect(live.fields).toContain("readAt");
    expect(live.fields).not.toContain("configRevision");
    expect(live.configRevision).toBe("rev-live");
    expect(live.note).toContain("config revision rev-live");
    // Every field outside LIVE_FIELDS is the snapshot's.
    for (const k of Object.keys(d.vote) as (keyof Dataset["vote"])[]) if (!(LIVE_FIELDS as readonly string[]).includes(k)) expect(dataset.vote[k], k).toEqual(d.vote[k]);
    // A read without readAt does not keep the snapshot's block next to the live pool.
    const h2 = harness([() => ({ manifest: { ...withPool("700000000000"), readAt: undefined } })]);
    expect((await h2.live.apply(d)).dataset.vote.readAt).toBeNull();
  });

  it("Ballot Prep names a config revision mismatch next to the rule checks, and only then (review v3)", async () => {
    const other = await harness([() => ({ manifest: { ...withPool("700000000000"), configRevision: "rev-live" } })]).live.apply(d);
    expect(other.live.revisionNote).toBe(`The live read has config revision rev-live; affiliation groups and ballot rules are from the published revision ${d.vote.configRevision ?? "(none)"}.`);
    expect(other.live.note).toContain(other.live.revisionNote!);
    const view = ballotView(other.dataset, other.live);
    expect(view.revisionNote).toBe(other.live.revisionNote);
    expect(view.poolMicro).toBe("700000000000");
    const same = await harness([() => ({ manifest: { ...withPool("700000000000"), configRevision: d.vote.configRevision ?? undefined } })]).live.apply(d);
    expect(same.live.revisionNote).toBeNull();
    expect(ballotView(same.dataset, same.live).revisionNote).toBeNull();
    expect(ballotView(d).revisionNote).toBeNull();
    const src = readFileSync(path.join(process.cwd(), "components", "workspace", "ballot-prep.tsx"), "utf8");
    expect(src).toContain("data-config-revision-note");
    expect(readFileSync(path.join(process.cwd(), "app", "workspace", "page.tsx"), "utf8")).toContain("ballotView(d, live)");
  });

  it("pages that show the live pool are rendered per request, so page age never adds to the 12-minute cache (review v2)", () => {
    const files = (readdirSync(path.join(process.cwd(), "app"), { recursive: true }) as string[]).filter((f) => /(^|\/)(page|route)\.tsx?$/.test(f));
    const users = files.filter((f) => readFileSync(path.join(process.cwd(), "app", f), "utf8").includes("withLiveVote"));
    expect(users.sort()).toEqual(["api/v1/vote-manifest/route.ts", "page.tsx", "status/page.tsx", "workspace/page.tsx"]);
    for (const f of users) {
      const src = readFileSync(path.join(process.cwd(), "app", f), "utf8");
      expect(src, f).toContain('export const dynamic = "force-dynamic";');
      expect(src, f).not.toMatch(/export const revalidate/);
    }
  });

  it("is off when disabled, in unit tests and during next build", async () => {
    expect(liveVoteEnabled({ ESI_LIVE_MANIFEST: "off" } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(liveVoteEnabled({ VITEST: "true" } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(liveVoteEnabled({ NEXT_PHASE: "phase-production-build" } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(liveVoteEnabled({} as unknown as NodeJS.ProcessEnv)).toBe(true);
    let calls = 0;
    const off = createLiveVote({
      enabled: () => false,
      fetcher: async () => {
        calls++;
        return { manifest: m };
      },
    });
    const r = await off.apply(d);
    expect(r.live.source).toBe("snapshot");
    expect(r.dataset).toBe(d);
    expect(calls).toBe(0);
  });
});
