/**
 * Vote manifest sync: slugs[i] and projects[i] must be confirmed to belong together on every
 * sync, or the section fails closed (no remapping, group features disabled). The fixture is the
 * live manifest stored by the latest valid snapshot (npm run ingest), read from its raw object.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { loadPublishedDataset } from "@/lib/db/file-store";
import type { Dataset } from "@/lib/domain/schemas";
import { ValidationFailure } from "@/lib/official/client";
import { VoteManifestResponseSchema, type ListResponse, type VoteManifest, type VoteManifestResponse } from "@/lib/official/schemas";
import { HttpError } from "@/lib/util/http";
import { buildVoteSection, microUsdToCents, voteFeatureState, type BallotRecord } from "@/lib/vote/manifest";
import { ballotRecords, fetchManifestObject, loadCohort } from "@/research/ingest";
import { validateVote } from "@/research/publish";
import { latestValidSnapshot, readObject, type SnapshotManifest } from "@/research/store";

let snapshot: SnapshotManifest;
let live: VoteManifest;
let cohort: Map<string, string>;
let ballot: Map<string, BallotRecord>;
let d: Dataset;

const source = { objectHash: "x".repeat(64), fetchedAt: "2026-11-26T00:00:00.000Z", stale: false, error: null };
const build = (m: VoteManifest | null) => buildVoteSection(m, source, cohort, ballot);
const clone = (m: VoteManifest): VoteManifest => structuredClone(m);

beforeAll(async () => {
  const s = await latestValidSnapshot();
  if (!s?.vote?.object) throw new Error("No snapshot with a vote manifest. Run npm run ingest.");
  snapshot = s;
  live = (await readObject<VoteManifestResponse>(s.vote.object)).manifest;
  const c = await loadCohort();
  if (!c) throw new Error("No cohort file");
  cohort = new Map(c.members.map((m) => [m.slug, m.id]));
  ballot = ballotRecords(await readObject<ListResponse>(s.ballotObject));
  d = await loadPublishedDataset();
});

describe("vote manifest alignment", () => {
  it("passes on the live manifest and attaches groups by index", () => {
    expect(VoteManifestResponseSchema.safeParse({ manifest: live }).success).toBe(true);
    const v = build(live);
    expect(v.alignment.checks.filter((c) => !c.ok)).toEqual([]);
    expect(v.status).toBe("aligned");
    expect(v.groupsAvailable).toBe(true);
    expect(Object.keys(v.initiativeGroups)).toHaveLength(cohort.size);
    live.slugs.forEach((slug, i) => {
      expect(v.initiativeGroups[cohort.get(slug) as string]).toEqual((live.projects[i]?.groups ?? []).map((g) => live.groups[g]));
    });
  });

  it("fails closed when two projects are swapped (no remapping)", () => {
    const m = clone(live);
    const i = m.projects.findIndex((p, k) => k > 0 && p.goalUsd !== m.projects[0]?.goalUsd);
    expect(i).toBeGreaterThan(0);
    [m.projects[0], m.projects[i]] = [m.projects[i]!, m.projects[0]!];
    const v = build(m);
    expect(v.status).toBe("unaligned");
    expect(v.groupsAvailable).toBe(false);
    expect(v.initiativeGroups).toEqual({});
    expect(v.alignment.checks.find((c) => c.check === "goal_by_index")?.ok).toBe(false);
    // Raw arrays are kept as published.
    expect(v.projects[0]?.goalMicroUsd).toBe(m.projects[0]?.goalUsd);
    expect(voteFeatureState(v).disabled).toContain("Affiliation groups");
  });

  it("fails closed on a length mismatch", () => {
    const m = clone(live);
    m.projects.pop();
    const v = build(m);
    expect(v.status).toBe("unaligned");
    expect(v.alignment.checks.find((c) => c.check === "projects_length")?.ok).toBe(false);
    expect(v.initiativeGroups).toEqual({});
  });

  it("fails closed when a slug is not in the cohort", () => {
    const m = clone(live);
    m.slugs[0] = "not-a-cohort-slug";
    const v = build(m);
    expect(v.status).toBe("unaligned");
    expect(v.alignment.checks.find((c) => c.check === "same_cohort")?.ok).toBe(false);
  });

  it("is unavailable when the manifest is missing", () => {
    const v = buildVoteSection(null, { ...source, objectHash: null, error: "The vote manifest returned HTTP 404" }, cohort, ballot);
    expect(v.status).toBe("unavailable");
    expect(v.statusReason).toMatch(/404/);
    expect(v.groupsAvailable).toBe(false);
    expect(v.scheduleAvailable).toBe(false);
    expect(v.poolCents).toBeNull();
    expect(voteFeatureState(v).disabled).toEqual(["Affiliation groups", "Ballot Prep checks", "Tally countdown from the official schedule"]);
    expect(validateVote({ vote: v, initiatives: d.initiatives })).toEqual([]);
  });

  it("rejects a changed shape at the schema boundary", () => {
    const { poolUsd: _drop, ...noPool } = live;
    expect(VoteManifestResponseSchema.safeParse({ manifest: noPool }).success).toBe(false);
    expect(VoteManifestResponseSchema.safeParse({ manifest: { ...live, poolUsd: 685303.72 } }).success).toBe(false);
    expect(VoteManifestResponseSchema.safeParse({ manifest: { ...live, projects: live.projects.map((p) => ({ ...p, groups: "x" })) } }).success).toBe(false);
    expect(VoteManifestResponseSchema.safeParse(live).success).toBe(false);
  });

  it("marks missing and shape-changed responses unavailable, and reuses the stored copy only after transport failures", async () => {
    const failed: { url: string; error: string }[] = [];
    const notFound = await fetchManifestObject(snapshot, failed, async () => {
      throw new HttpError("HTTP 404", "u", 404, 1);
    });
    expect(notFound.object).toBeNull();
    expect(notFound.error).toMatch(/HTTP 404/);
    const changed = await fetchManifestObject(snapshot, failed, async () => {
      throw new ValidationFailure("Schema validation failed", "u", ["manifest.poolUsd: expected string"]);
    });
    expect(changed.object).toBeNull();
    expect(changed.error).toMatch(/no longer matches the expected shape/);
    const timeout = await fetchManifestObject(snapshot, failed, async () => {
      throw new HttpError("timeout", "u", null, 3);
    });
    expect(timeout.object).toBe(snapshot.vote?.object);
    expect(timeout.stale).toBe(true);
    expect(failed).toHaveLength(3);
  });
});

describe("vote manifest amounts and publication", () => {
  it("converts six-decimal USD to cents exactly, and refuses sub-cent values", () => {
    expect(microUsdToCents("685303720000")).toBe(68_530_372);
    expect(microUsdToCents("1")).toBeNull();
    expect(microUsdToCents("12.5")).toBeNull();
    expect(microUsdToCents(live.poolUsd)).toBe(Number(BigInt(live.poolUsd) / 10_000n));
  });

  it("publishes the aligned manifest from the latest snapshot", () => {
    expect(d.vote.status).toBe("aligned");
    expect(d.vote.slugs).toEqual(live.slugs);
    expect(d.vote.poolMicroUsd).toBe(live.poolUsd);
    expect(d.vote.schedule?.firstTallyAt).toEqual(live.schedule.firstTallyAt);
    expect(validateVote(d)).toEqual([]);
  });

  it("validateVote rejects groups attached without a confirmed alignment", () => {
    const unaligned = { ...d.vote, status: "unaligned" as const, groupsAvailable: false };
    expect(validateVote({ vote: unaligned, initiatives: d.initiatives })).toContain("vote: initiativeGroups must be empty when status is unaligned");
  });
});
