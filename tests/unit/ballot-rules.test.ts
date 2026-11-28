import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Dataset } from "@/lib/domain/schemas";
import { isNeutral } from "@/lib/neutralLanguage";
import { checkBallot, fixFor, formatMicroUsd, shareText, sizeThreshold, type BallotProject, type Draft } from "@/lib/vote/ballot-rules";
import { ballotView } from "@/lib/vote/view-data";

const d = JSON.parse(readFileSync(path.join(process.cwd(), "data", "published", "dataset.json"), "utf8")) as Dataset;

const P = (id: string, goal: bigint, ask: bigint | null, groups: string[] = []): BallotProject => ({ id, goalMicro: goal, askMicro: ask, groups });
const M = 1_000_000n; // one dollar in micro-USD

describe("rule 1: asks on the ballot reach 1.5 × pool", () => {
  const pool = 685_303_720_000n;
  const threshold = sizeThreshold(pool);
  // Asks sum to more than the threshold in total, so the threshold is the amount needed.
  const projects = [P("a", 300_000n * M, threshold - 100n), P("b", 300_000n * M, 100n), P("c", 300_000n * M, 1n), P("d", 300_000n * M, 500_000n * M)];

  it("computes ceil(1.5 × pool) exactly", () => {
    expect(threshold).toBe(1_027_955_580_000n);
    expect(sizeThreshold(3n)).toBe(5n);
    expect(sizeThreshold(4n)).toBe(6n);
  });
  it("passes at exactly 1.5 × pool", () => {
    const r = checkBallot({ projects, poolMicro: pool }, { a: "S", b: "A" });
    expect(r.size.requestedMicro).toBe(threshold);
    expect(r.size).toMatchObject({ ok: true, neededMicro: threshold, capped: false, shortMicro: 0n });
    expect(fixFor(r.size)).toBeNull();
  });
  it("fails one micro-USD below", () => {
    const short = [P("a", M, threshold - 101n), P("b", M, 100n), P("d", M, 500_000n * M)];
    const r = checkBallot({ projects: short, poolMicro: pool }, { a: "S", b: "B" });
    expect(r.size).toMatchObject({ ok: false, shortMicro: 1n });
    expect(fixFor(r.size)).toBe("Add initiatives to any tier until the asks total reaches $1,027,955.58 ($0.000001 more).");
  });
  it("counts asks in every tier, not only S-tier", () => {
    const r = checkBallot({ projects, poolMicro: pool }, { a: "B", b: "B" });
    expect(r.size.ok).toBe(true);
  });
  it("caps the amount needed at the sum of all asks, as the official app does", () => {
    const small = [P("a", M, 10n * M), P("b", M, 20n * M)];
    const all = checkBallot({ projects: small, poolMicro: pool }, { a: "S", b: "S" });
    expect(all.size).toMatchObject({ ok: true, neededMicro: 30n * M, capped: true });
    expect(checkBallot({ projects: small, poolMicro: pool }, { a: "S" }).size.ok).toBe(false);
  });
  it("is not computed when an ask is unavailable", () => {
    const r = checkBallot({ projects: [P("a", M, null), P("b", M, M)], poolMicro: 1n }, { b: "S" });
    expect(r.size.ok).toBeNull();
    expect(r.ok).toBe(false);
  });
});

describe("rule 2: S-tier holds at least 3 pairwise-unaffiliated initiatives", () => {
  const projects = [P("c1", M, M, ["colibri"]), P("c2", M, M, ["colibri"]), P("c3", M, M, ["colibri"]), P("u1", M, M), P("u2", M, M), P("r1", M, M), P("r2", M, M), P("r3", M, M)];
  const run = (draft: Draft) => checkBallot({ projects, poolMicro: 0n }, draft).independent[0]!;

  it("passes with exactly 3 unaffiliated initiatives", () => {
    expect(run({ c1: "S", u1: "S", u2: "S" })).toMatchObject({ ok: true, found: 3, proof: ["c1", "u1", "u2"] });
  });
  it("fails with 2, counting an affiliated pair once", () => {
    const r = run({ c1: "S", c2: "S", u1: "S" });
    expect(r).toMatchObject({ ok: false, found: 2, tierCount: 3, related: [{ group: "colibri", ids: ["c1", "c2"] }] });
    expect(fixFor(r)).toBe("Add initiatives to S-tier that share no affiliation group with each other until three qualify (2 now).");
    expect(run({ c1: "S", c2: "S", c3: "S" })).toMatchObject({ ok: false, found: 1 });
    expect(run({})).toMatchObject({ ok: false, found: 0, tierCount: 0 });
  });
  it("treats RFPs with empty groups as unaffiliated", () => {
    expect(run({ r1: "S", r2: "S", r3: "S" })).toMatchObject({ ok: true, found: 3 });
  });
  it("ignores A-tier and B-tier when the manifest names S-tier only", () => {
    const r = checkBallot({ projects, poolMicro: 0n, independentTiers: 1 }, { u1: "S", r1: "A", r2: "B" });
    expect(r.independent.map((c) => c.tier)).toEqual(["S"]);
    expect(r.independent[0]!.ok).toBe(false);
    expect(checkBallot({ projects, poolMicro: 0n, independentTiers: 3 }, { u1: "S", r1: "A" }).independent.map((c) => c.tier)).toEqual(["S", "A"]);
  });
  it("treats any shared group as an affiliation for initiatives with several groups", () => {
    const multi = [P("x", M, M, ["g1", "g2"]), P("y", M, M, ["g2"]), P("z", M, M), P("w", M, M)];
    expect(checkBallot({ projects: multi, poolMicro: 0n }, { x: "S", y: "S", z: "S" }).independent[0]!.found).toBe(2);
    expect(checkBallot({ projects: multi, poolMicro: 0n }, { x: "S", y: "S", z: "S", w: "S" }).independent[0]!.ok).toBe(true);
  });
});

describe("rule 3: affiliated goals in S-tier are at most 50% of S-tier goals", () => {
  it("passes at exactly 50%", () => {
    const projects = [P("g1", 30n * M, M, ["SEAL"]), P("g2", 20n * M, M, ["SEAL"]), P("u1", 25n * M, M), P("u2", 25n * M, M)];
    const r = checkBallot({ projects, poolMicro: 0n }, { g1: "S", g2: "S", u1: "S", u2: "S" }).group[0]!;
    expect(r.tierGoalMicro).toBe(100n * M);
    expect(r.groups).toEqual([{ group: "SEAL", ids: ["g1", "g2"], goalMicro: 50n * M, ok: true }]);
    expect(r.ok).toBe(true);
    expect(shareText(50n * M, 100n * M)).toBe("50.00%");
  });
  it("fails one micro-USD above 50%", () => {
    const projects = [P("g1", 30n * M + 1n, M, ["SEAL"]), P("g2", 20n * M, M, ["SEAL"]), P("u1", 25n * M, M), P("u2", 25n * M, M)];
    const r = checkBallot({ projects, poolMicro: 0n }, { g1: "S", g2: "S", u1: "S", u2: "S" }).group[0]!;
    // 2 × 50,000,001 = 100,000,002 > 100,000,001.
    expect(r.ok).toBe(false);
    expect(fixFor(r.groups[0]!)).toBe("Bring SEAL to 50% or less of the tier's goals: move one of its initiatives to another tier, or add other initiatives to this tier.");
  });
  it("applies to a single affiliated initiative too, and RFPs never form a group", () => {
    const projects = [P("big", 60n * M, M, ["Argot"]), P("r1", 20n * M, M), P("r2", 20n * M, M)];
    const r = checkBallot({ projects, poolMicro: 0n }, { big: "S", r1: "S", r2: "S" });
    expect(r.group[0]!.groups.map((g) => g.group)).toEqual(["Argot"]);
    expect(r.group[0]!.ok).toBe(false);
    expect(checkBallot({ projects, poolMicro: 0n }, { r1: "S", r2: "S" }).group[0]).toMatchObject({ ok: true, groups: [] });
  });
  it("uses goals, not asks", () => {
    const projects = [P("g", 50n * M, 1n, ["x"]), P("u", 50n * M, 999n * M)];
    expect(checkBallot({ projects, poolMicro: 0n }, { g: "S", u: "S" }).group[0]!.ok).toBe(true);
  });
});

describe("tier order", () => {
  const projects = [P("a", M, M), P("b", M, M)];
  it("fails when an earlier tier is empty and a later one is used", () => {
    const r = checkBallot({ projects, poolMicro: 0n }, { a: "A" });
    expect(r.order).toEqual({ rule: "order", ok: false, empty: ["S"] });
    expect(fixFor(r.order)).toBe("Place at least one initiative in S-tier before using a later tier.");
    expect(checkBallot({ projects, poolMicro: 0n }, { a: "S", b: "B" }).order.empty).toEqual(["A"]);
    expect(checkBallot({ projects, poolMicro: 0n }, { a: "S" }).order.ok).toBe(true);
  });
});

describe("live dataset", () => {
  const view = ballotView(d);
  const projects = view.items.map((i) => P(i.id, BigInt(i.goalMicro!), i.askCents === null ? null : BigInt(i.askCents) * 10_000n, i.groups));

  it("covers every initiative of the cohort, with the live manifest pool", () => {
    expect(view.disabledReason).toBeNull();
    expect(view.items).toHaveLength(d.initiatives.length);
    expect(view.poolMicro).toBe(d.vote.poolMicroUsd);
    expect(view.items.filter((i) => i.rfp).every((i) => i.groups.length === 0)).toBe(true);
    const names = view.items.map((i) => i.label);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
  it("aligns goals with the manifest by slug index", () => {
    for (const i of view.items) {
      const ini = d.initiatives.find((x) => x.id === i.id)!;
      expect(BigInt(i.goalMicro!)).toBe(BigInt(ini.funding.goalCents) * 10_000n);
    }
  });
  it("a ballot holding every initiative in B-tier passes the size rule and fails the S-tier and tier-order rules", () => {
    const draft: Draft = Object.fromEntries(view.items.map((i) => [i.id, "B" as const]));
    const r = checkBallot({ projects, poolMicro: BigInt(view.poolMicro!), independentTiers: view.independentTiers }, draft);
    expect(r.size.ok).toBe(true);
    expect(r.independent[0]!.ok).toBe(false);
    expect(r.order.ok).toBe(false);
  });
  it("disables the checks when the manifest is unavailable", () => {
    const off = ballotView({ ...d, vote: { ...d.vote, status: "unavailable", groupsAvailable: false, poolCents: null, poolMicroUsd: null } });
    expect(off.disabledReason).toMatch(/Rule checks are off/);
    expect(off.items.every((i) => i.goalMicro === null && i.groups.length === 0)).toBe(true);
  });
});

describe("wording", () => {
  it("fix lines and formatting pass the neutral-language rules", () => {
    const projects = [P("a", M, M, ["g"]), P("b", M, M, ["g"]), P("c", M, 100n * M)];
    const r = checkBallot({ projects, poolMicro: 10n * M }, { a: "S", b: "S" });
    const lines = [fixFor(r.size), fixFor(r.independent[0]!), fixFor(r.group[0]!.groups[0]!), fixFor(checkBallot({ projects, poolMicro: 0n }, { a: "B" }).order)];
    expect(lines.every((l) => typeof l === "string" && isNeutral(l))).toBe(true);
    expect(formatMicroUsd(685_303_720_000n)).toBe("$685,303.72");
    expect(formatMicroUsd(1_500_000n)).toBe("$1.50");
  });
});
