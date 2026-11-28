/**
 * Cohort and initiative metrics against the published dataset. The expected figures are
 * validation references taken from the official API on 2026-11-26 (snapshot 20261126T130839Z); the application never
 * hardcodes them, it computes them from the dataset.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { loadPublishedDataset } from "@/lib/db/file-store";
import type { Dataset, Initiative } from "@/lib/domain/schemas";
import { cohortMetrics, initiativeMetrics } from "@/lib/metrics/compute";
import { METRIC_BY_ID } from "@/lib/metrics/registry";
import { sumCents } from "@/lib/util/money";

let d: Dataset;
beforeAll(async () => {
  d = await loadPublishedDataset();
});

const val = (m: ReturnType<typeof cohortMetrics>, id: string) => m[id]?.value;

describe("cohort metrics (official baseline)", () => {
  it("counts the frozen cohort", () => {
    expect(d.initiatives).toHaveLength(55);
    expect(d.initiatives.filter((i) => i.type === "grant")).toHaveLength(47);
    expect(d.initiatives.filter((i) => i.type === "rfp")).toHaveLength(8);
    expect(val(cohortMetrics(d), "cohort.initiatives")).toBe(55);
  });

  it("matches the official goal, raised and remaining figures in integer cents", () => {
    const m = cohortMetrics(d);
    expect(val(m, "cohort.goal")).toBe(559_380_000);
    expect(val(m, "cohort.raised")).toBe(179_923_632);
    expect(val(m, "cohort.remaining")).toBe(379_456_368);
    // No initiative's gap exceeds the $200,000 cap in this snapshot, so the ask equals the gap.
    expect(val(m, "cohort.thedao_ask")).toBe(379_456_368);
    expect(val(m, "cohort.pledged_outstanding")).toBe(164_437_300);
    expect(val(m, "cohort.received_pledges")).toBe(8_920_000);
    expect(val(m, "cohort.donated")).toBe(15_486_332);
    for (const x of Object.values(m)) if (x.value !== null && x.id !== "cohort.top5_backer_share" && !x.id.endsWith("coverage") && !x.id.endsWith("verified")) expect(Number.isSafeInteger(x.value), x.id).toBe(true);
  });

  it("counts milestones, adoption milestones and completed milestones", () => {
    const m = cohortMetrics(d);
    expect(val(m, "cohort.milestones")).toBe(211);
    expect(val(m, "cohort.adoption_milestones")).toBe(92);
    expect(val(m, "cohort.adoption_budget")).toBe(260_733_300);
    expect(val(m, "cohort.completed_milestones")).toBe(4);
  });

  it("counts pledge records by status", () => {
    expect(val(cohortMetrics(d), "cohort.pledge_records")).toBe(86);
    expect(d.pledges.filter((p) => p.status === "pledged")).toHaveLength(78);
    expect(d.pledges.filter((p) => p.status === "received")).toHaveLength(8);
    expect(sumCents(d.pledges.filter((p) => p.status === "pledged").map((p) => p.amountCents))).toBe(164_437_300);
    expect(sumCents(d.pledges.filter((p) => p.status === "received").map((p) => p.amountCents))).toBe(8_920_000);
  });

  it("records the 8 RFPs as having no designated recipient", () => {
    const rfps = d.initiatives.filter((i) => i.type === "rfp");
    expect(rfps.filter((i) => i.organizationId === null && !i.recipientTeam)).toHaveLength(8);
  });

  it("never double counts received pledges: raised = outstanding pledges + confirmed donations", () => {
    for (const i of d.initiatives) {
      const f = i.funding;
      expect(f.officialRaisedCents, i.slug).toBe(f.pledgedCents + f.donatedCents);
      expect(f.receivedCents, i.slug).toBeLessThanOrEqual(f.donatedCents);
    }
    const m = cohortMetrics(d);
    expect(val(m, "cohort.raised")).toBe((val(m, "cohort.pledged_outstanding") as number) + (val(m, "cohort.donated") as number));
    expect(val(m, "cohort.raised")).not.toBe((val(m, "cohort.pledged_outstanding") as number) + (val(m, "cohort.donated") as number) + (val(m, "cohort.received_pledges") as number));
  });

  it("reconciles milestone amounts with the goal for all 55 initiatives", () => {
    for (const i of d.initiatives) {
      const ms = d.milestones.filter((m) => m.initiativeId === i.id);
      expect(ms.length, i.slug).toBeGreaterThan(0);
      expect(sumCents(ms.map((m) => m.amountCents)), i.slug).toBe(i.funding.goalCents);
    }
  });

  it("only emits registered metrics", () => {
    for (const id of Object.keys(cohortMetrics(d))) expect(METRIC_BY_ID.has(id), id).toBe(true);
    for (const id of Object.keys(initiativeMetrics(d, d.initiatives[0]!))) expect(METRIC_BY_ID.has(id), id).toBe(true);
  });
});

describe("unavailable values are null with a reason, never zero", () => {
  it("returns null with a reason for ratios with a zero denominator", () => {
    const base = d.initiatives[0]!;
    const empty: Initiative = {
      ...base,
      id: "test_empty",
      organizationId: null,
      funding: { ...base.funding, goalCents: 0, officialRaisedCents: 0, pledgedCents: 0, donatedCents: 0, receivedCents: 0, remainingCents: 0 },
    };
    const m = initiativeMetrics(d, empty);
    for (const id of ["initiative.pct_funded", "initiative.donated_share", "initiative.top_backer_share", "initiative.backer_hhi", "initiative.self_pledged", "initiative.adoption_share", "initiative.evidence_coverage"]) {
      expect(m[id]?.value, id).toBeNull();
      expect(m[id]?.unavailableReason, id).toMatch(/\w/);
    }
    expect(m["initiative.pct_funded"]?.unavailableReason).toBe("Goal is zero");
    expect(m["initiative.top_backer_share"]?.unavailableReason).toBe("No pledges");
    expect(m["initiative.self_pledged"]?.unavailableReason).toBe("Recipient is not a resolved organization");
  });

  it("returns null with a reason for cohort ratios over an empty slice", () => {
    const m = cohortMetrics({ ...d, initiatives: [], pledges: [], donations: [] });
    expect(m["cohort.top5_backer_share"]).toEqual({ id: "cohort.top5_backer_share", value: null, unavailableReason: "No pledges" });
    expect(m["cohort.research_coverage"]).toEqual({ id: "cohort.research_coverage", value: null, unavailableReason: "Empty cohort" });
    expect(m["cohort.donations_verified"]).toEqual({ id: "cohort.donations_verified", value: null, unavailableReason: "No donations" });
  });

  it("keeps a reason on every null and none on every value across all initiatives", () => {
    for (const i of d.initiatives) {
      for (const x of Object.values(initiativeMetrics(d, i))) {
        if (x.value === null) expect(x.unavailableReason, `${i.slug} ${x.id}`).toMatch(/\w/);
        else expect(x.unavailableReason, `${i.slug} ${x.id}`).toBeNull();
      }
    }
  });

  it("uses null (not 0%) for backer concentration when an initiative has no pledges", () => {
    const withoutPledges = d.initiatives.filter((i) => !d.pledges.some((p) => p.initiativeId === i.id));
    for (const i of withoutPledges) expect(initiativeMetrics(d, i)["initiative.top_backer_share"]?.value, i.slug).toBeNull();
  });
});
