/** TheDAO ask = min(200,000 USD, max(0, goal − raised)); unavailable inputs give null, never 0. */
import { beforeAll, describe, expect, it } from "vitest";
import { loadPublishedDataset } from "@/lib/db/file-store";
import type { Dataset } from "@/lib/domain/schemas";
import { remainingGapCents, THEDAO_ASK_CAP_CENTS, theDaoAskCents } from "@/lib/metrics/ask";
import { cohortMetrics, initiativeMetrics } from "@/lib/metrics/compute";
import { METRIC_BY_ID } from "@/lib/metrics/registry";

const usd = (n: number) => Math.round(n * 100);

describe("TheDAO ask formula", () => {
  it("caps the ask at $200,000", () => {
    expect(THEDAO_ASK_CAP_CENTS).toBe(usd(200_000));
    expect(theDaoAskCents(usd(500_000), usd(100_000))).toBe(usd(200_000));
    expect(remainingGapCents(usd(500_000), usd(100_000))).toBe(usd(400_000));
  });

  it("returns exactly $200,000 when the gap is exactly the cap", () => {
    expect(theDaoAskCents(usd(300_000), usd(100_000))).toBe(usd(200_000));
  });

  it("returns the gap when it is below the cap", () => {
    expect(theDaoAskCents(usd(250_000), usd(100_000.01))).toBe(usd(149_999.99));
  });

  it("is 0 for over-funded and exactly funded initiatives", () => {
    expect(theDaoAskCents(usd(100_000), usd(150_000))).toBe(0);
    expect(theDaoAskCents(usd(100_000), usd(100_000))).toBe(0);
  });

  it("is unavailable (null), never 0, when goal or raised is missing or invalid", () => {
    expect(theDaoAskCents(null, usd(10))).toBeNull();
    expect(theDaoAskCents(usd(10), null)).toBeNull();
    expect(theDaoAskCents(undefined, undefined)).toBeNull();
    expect(theDaoAskCents(Number.NaN, 0)).toBeNull();
    expect(theDaoAskCents(-1, 0)).toBeNull();
    expect(theDaoAskCents(10.5, 0)).toBeNull();
  });
});

describe("TheDAO ask in the published dataset", () => {
  let d: Dataset;
  beforeAll(async () => {
    d = await loadPublishedDataset();
  });

  it("is registered and documented separately from the remaining funding gap", () => {
    expect(METRIC_BY_ID.get("initiative.thedao_ask")?.name).toBe("TheDAO ask");
    expect(METRIC_BY_ID.get("cohort.thedao_ask")).toBeDefined();
    expect(METRIC_BY_ID.get("initiative.remaining")?.name).toBe("Remaining funding gap");
    expect(METRIC_BY_ID.get("cohort.remaining")?.name).toBe("Remaining funding gap");
  });

  it("equals the formula for every initiative, using official raised (pledged + donated, received counted once)", () => {
    for (const i of d.initiatives) {
      const f = i.funding;
      expect(f.pledgedCents + f.donatedCents, i.slug).toBe(f.officialRaisedCents);
      expect(f.theDaoAskCents, i.slug).toBe(Math.min(THEDAO_ASK_CAP_CENTS, Math.max(0, f.goalCents - f.officialRaisedCents)));
      expect(initiativeMetrics(d, i)["initiative.thedao_ask"]?.value, i.slug).toBe(f.theDaoAskCents);
    }
  });

  it("sums over the cohort only", () => {
    const m = cohortMetrics(d);
    expect(d.initiatives).toHaveLength(d.meta.cohort.size);
    expect(m["cohort.thedao_ask"]?.value).toBe(d.initiatives.reduce((s, i) => s + (i.funding.theDaoAskCents ?? 0), 0));
  });
});
