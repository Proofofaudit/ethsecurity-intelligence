import { beforeAll, describe, expect, it } from "vitest";
import { loadPublishedDataset } from "@/lib/db/file-store";
import type { Dataset } from "@/lib/domain/schemas";
import { FilterSchema, ScenarioSchema, compare, envelope, filterInitiatives, simulatePortfolio, summarize, traceClaim } from "@/lib/intelligence/service";

let d: Dataset;
beforeAll(async () => {
  d = await loadPublishedDataset();
});

const ids = (r: ReturnType<typeof filterInitiatives>) => r.items.map((i) => i.id).sort();
const expected = (pred: (s: ReturnType<typeof summarize>) => boolean) =>
  d.initiatives
    .map((i) => summarize(d, i))
    .filter(pred)
    .map((s) => s.id)
    .sort();

describe("filterInitiatives", () => {
  it("defaults to a neutral alphabetical order over all 55", () => {
    const r = filterInitiatives(d);
    expect(r.total).toBe(55);
    expect(r.sort).toBe("title");
    expect(r.sortNote).toMatch(/Alphabetical/);
    const titles = r.items.map((i) => i.title.toLowerCase());
    expect(titles).toEqual([...titles].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  });

  it("filters by type", () => {
    expect(filterInitiatives(d, { type: "rfp" }).total).toBe(8);
    expect(filterInitiatives(d, { type: "grant" }).total).toBe(47);
  });

  it("filters by category and lifecycle stage", () => {
    const cat = d.initiatives[0]!.categories[0]!.slug;
    expect(ids(filterInitiatives(d, { categories: [cat] }))).toEqual(d.initiatives.filter((i) => i.categories.some((c) => c.slug === cat)).map((i) => i.id).sort());
    const stage = d.initiatives[0]!.stages[0]!.stage;
    expect(ids(filterInitiatives(d, { stages: [stage] }))).toEqual(d.initiatives.filter((i) => i.stages.some((s) => s.stage === stage)).map((i) => i.id).sort());
  });

  it("filters by goal range in dollars and funded percentage", () => {
    expect(ids(filterInitiatives(d, { goalMinUsd: 100_000, goalMaxUsd: 150_000 }))).toEqual(
      d.initiatives.filter((i) => i.funding.goalCents >= 10_000_000 && i.funding.goalCents <= 15_000_000).map((i) => i.id).sort(),
    );
    expect(ids(filterInitiatives(d, { fundedMinPct: 50 }))).toEqual(
      d.initiatives.filter((i) => i.funding.goalCents > 0 && i.funding.officialRaisedCents / i.funding.goalCents >= 0.5).map((i) => i.id).sort(),
    );
    expect(filterInitiatives(d, { fundedMaxPct: 100 }).total).toBe(55);
  });

  it("filters by adoption and completed milestones computed from milestone records", () => {
    const withAdoption = new Set(d.milestones.filter((m) => m.adoption).map((m) => m.initiativeId));
    expect(ids(filterInitiatives(d, { adoption: "has" }))).toEqual([...withAdoption].sort());
    expect(filterInitiatives(d, { adoption: "none" }).total).toBe(55 - withAdoption.size);
    const done = new Set(d.milestones.filter((m) => m.done).map((m) => m.initiativeId));
    expect(ids(filterInitiatives(d, { hasCompletedMilestone: true }))).toEqual([...done].sort());
    expect(filterInitiatives(d, { hasCompletedMilestone: false }).total).toBe(55 - done.size);
  });

  it("filters by evidence, existing work, planned integrations and research completeness", () => {
    expect(ids(filterInitiatives(d, { hasSupportedEvidence: true }))).toEqual(expected((s) => s.supportedClaims > 0));
    expect(ids(filterInitiatives(d, { existingWork: true }))).toEqual(expected((s) => s.hasExistingWork));
    expect(ids(filterInitiatives(d, { existingWork: false }))).toEqual(expected((s) => !s.hasExistingWork));
    expect(ids(filterInitiatives(d, { hasPlannedIntegrations: true }))).toEqual(
      [...new Set(d.claims.filter((c) => c.kind === "integration" && c.status === "future_target").map((c) => c.initiativeId))].sort(),
    );
    expect(ids(filterInitiatives(d, { researchComplete: true }))).toEqual(expected((s) => s.researchComplete));
  });

  it("filters by standard (case-insensitive) and organisation", () => {
    const std = d.initiatives.flatMap((i) => i.standards)[0]!;
    expect(ids(filterInitiatives(d, { standard: std.toLowerCase() }))).toEqual(d.initiatives.filter((i) => i.standards.includes(std)).map((i) => i.id).sort());
    const org = d.initiatives.find((i) => i.organizationId)!.organizationId!;
    expect(ids(filterInitiatives(d, { organizationId: org }))).toEqual(d.initiatives.filter((i) => i.organizationId === org).map((i) => i.id).sort());
  });

  it("finds an initiative by a word from its title and orders by relevance", () => {
    const target = d.initiatives.find((i) => /colibri/i.test(i.title)) ?? d.initiatives[0]!;
    const word = target.title.split(/\W+/).find((w) => w.length > 6)!;
    const r = filterInitiatives(d, { q: word });
    expect(r.sort).toBe("relevance");
    expect(r.items.map((i) => i.id)).toContain(target.id);
  });

  it("sorts only when the user asks, and paginates", () => {
    const r = filterInitiatives(d, { sort: "goal", order: "desc" });
    const goals = r.items.map((i) => i.goalCents);
    expect(goals).toEqual([...goals].sort((a, b) => b - a));
    expect(r.sortNote).toMatch(/chosen by the user/);
    const page = filterInitiatives(d, { limit: 10, offset: 10 });
    expect(page.items.map((i) => i.id)).toEqual(filterInitiatives(d).items.slice(10, 20).map((i) => i.id));
  });

  it("rejects unknown or out-of-range filters", () => {
    expect(FilterSchema.safeParse({ fundedMinPct: 150 }).success).toBe(false);
    expect(FilterSchema.safeParse({ rank: "best" }).success).toBe(false);
    expect(FilterSchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(FilterSchema.safeParse({ stages: ["not_a_stage"] }).success).toBe(false);
  });
});

describe("compare", () => {
  it("flags rows whose rendered values differ", () => {
    const grant = d.initiatives.find((i) => i.type === "grant")!;
    const rfp = d.initiatives.find((i) => i.type === "rfp")!;
    const c = compare(d, [grant.id, rfp.id]);
    expect(c.initiatives).toHaveLength(2);
    expect(c.rows.find((r) => r.key === "type")).toMatchObject({ values: ["Grant", "RFP"], differs: true });
    expect(c.rows.find((r) => r.key === "org")?.values[1]).toBe("No designated recipient (RFP)");
    const same = compare(d, [grant.id, grant.slug]);
    expect(same.rows.every((r) => !r.differs)).toBe(true);
  });

  it("ignores unknown ids and caps at five initiatives", () => {
    expect(compare(d, ["missing"]).initiatives).toHaveLength(0);
    expect(compare(d, d.initiatives.slice(0, 7).map((i) => i.id)).initiatives).toHaveLength(5);
  });
});

describe("simulatePortfolio", () => {
  it("is deterministic and reproduces official funding at full pledge conversion", () => {
    const sel = d.initiatives.slice(0, 5).map((i) => i.id);
    const a = simulatePortfolio(d, { initiativeIds: sel });
    const b = simulatePortfolio(d, { initiativeIds: sel });
    expect(a).toEqual(b);
    for (const r of a.rows) {
      const ini = d.initiatives.find((i) => i.id === r.id)!;
      expect(r.securedCents).toBe(ini.funding.officialRaisedCents);
      expect(r.gapCents).toBe(Math.max(0, ini.funding.goalCents - ini.funding.officialRaisedCents));
    }
    expect(a.allocation.every((x) => x.allocatedCents === null)).toBe(true);
  });

  it("applies pledge conversion, adoption exclusion and budget in the user's order", () => {
    const all = d.initiatives.map((i) => i.id);
    const full = simulatePortfolio(d, { initiativeIds: all });
    expect(full.totals.gapCents).toBe(379_480_081);
    const half = simulatePortfolio(d, { initiativeIds: all, pledgeConversion: 0.5 });
    expect(half.totals.securedCents).toBeLessThan(full.totals.securedCents);
    const noAdoption = simulatePortfolio(d, { initiativeIds: all, excludeAdoptionMilestones: true });
    expect(noAdoption.totals.scopeCents).toBeLessThan(full.totals.scopeCents);
    const budget = simulatePortfolio(d, { initiativeIds: all, budgetUsd: 1000 });
    expect(budget.totals.budgetLeftCents).toBe(0);
    expect(budget.allocation.reduce((s, x) => s + (x.allocatedCents ?? 0), 0)).toBe(100_000);
  });

  it("rejects invalid scenarios", () => {
    expect(ScenarioSchema.safeParse({ initiativeIds: [] }).success).toBe(false);
    expect(ScenarioSchema.safeParse({ initiativeIds: ["x"], pledgeConversion: 2 }).success).toBe(false);
    expect(ScenarioSchema.safeParse({ initiativeIds: ["x"], budgetUsd: -1 }).success).toBe(false);
    expect(ScenarioSchema.safeParse({ initiativeIds: ["x"], winner: "x" }).success).toBe(false);
    expect(() => simulatePortfolio(d, { initiativeIds: ["x"], adoptionDelayMonths: 1.5 })).toThrow();
  });
});

describe("traceClaim", () => {
  it("returns the evidence and impact trace for a pledge claim", () => {
    const claim = d.claims.find((c) => c.kind === "funding_pledge")!;
    const t = traceClaim(d, claim.id)!;
    expect(t.claim.id).toBe(claim.id);
    expect(t.initiative?.id).toBe(claim.initiativeId);
    expect(t.evidence.map((e) => e.id).sort()).toEqual(d.evidence.filter((e) => claim.evidenceIds.includes(e.id)).map((e) => e.id).sort());
    expect(t.impact.metrics).toContain("initiative.backers");
    expect(t.impact.views.length).toBeGreaterThan(0);
    expect(t.impact.mcpTools).toContain("get_claim");
  });

  it("returns null for an unknown claim", () => {
    expect(traceClaim(d, "clm_missing")).toBeNull();
  });
});

describe("envelope", () => {
  it("always carries sources, freshness, methodology and limitations", () => {
    const e = envelope(d, { x: 1 });
    expect(e.data).toEqual({ x: 1 });
    expect(e.meta.sources.length).toBeGreaterThan(0);
    expect(e.meta.datasetVersion).toBe(d.meta.datasetVersion);
    expect(e.meta.officialDataGeneratedAt).toBe(d.meta.officialGeneratedAt);
    expect(e.meta.publishedAt).toBe(d.meta.generatedAt);
    expect(e.meta.methodology).toMatch(/^https:\/\//);
    expect(e.meta.methodologyVersion).toMatch(/\w/);
    expect(e.meta.limitations.length).toBeGreaterThan(0);
    const custom = envelope(d, null, { sources: ["https://example.org"], limitations: ["Extra"] });
    expect(custom.meta.sources).toEqual(["https://example.org"]);
    expect(custom.meta.limitations[0]).toBe("Extra");
  });
});
