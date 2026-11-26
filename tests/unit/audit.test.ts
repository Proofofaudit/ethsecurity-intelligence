/** The truth audit passes on the published dataset and blocks tampered figures and quotes. */
import { beforeAll, describe, expect, it } from "vitest";
import { loadPublishedDataset } from "@/lib/db/file-store";
import type { Dataset } from "@/lib/domain/schemas";
import { auditDataset } from "@/research/audit";
import { readSnapshot, type SnapshotManifest } from "@/research/store";

let d: Dataset;
let manifest: SnapshotManifest;
const clone = <T>(x: T): T => structuredClone(x);

beforeAll(async () => {
  d = await loadPublishedDataset();
  const snapshotId = d.meta.datasetVersion.split("+")[0]!;
  const m = await readSnapshot(snapshotId);
  if (!m) throw new Error(`Snapshot ${snapshotId} not found`);
  manifest = m;
});

describe("truth audit", () => {
  it("passes on the published dataset", async () => {
    const r = await auditDataset(d, manifest);
    expect(r.failures).toEqual([]);
    expect(r.checked).toBeGreaterThan(1000);
    for (const check of ["goal", "raised", "pledged", "received", "donated", "milestone_fields", "pledge_claim_matches_source", "quote_verbatim", "cohort_goal", "cohort_raised"]) {
      expect(r.byCheck[check]?.checked, check).toBeGreaterThan(0);
    }
  });

  it("fails when an initiative goal is altered by one cent", async () => {
    const t = clone(d);
    t.initiatives[0]!.funding.goalCents += 1;
    const r = await auditDataset(t, manifest);
    expect(r.failures).toContain(`[goal] ${t.initiatives[0]!.slug} goal`);
    expect(r.failures.some((f) => f.startsWith("[cohort_goal]"))).toBe(true);
  });

  it("fails when raised, donated or a milestone amount is altered", async () => {
    const t = clone(d);
    t.initiatives[1]!.funding.officialRaisedCents += 100;
    t.initiatives[2]!.funding.donatedCents -= 1;
    const ms = t.milestones.find((m) => m.initiativeId === t.initiatives[3]!.id)!;
    ms.amountCents += 1;
    const r = await auditDataset(t, manifest);
    expect(r.byCheck.raised?.failed).toBe(1);
    expect(r.byCheck.donated?.failed).toBe(1);
    expect(r.byCheck.milestone_fields?.failed).toBe(1);
  });

  it("fails when a quoted statement is changed", async () => {
    const t = clone(d);
    const c = t.claims.find((x) => x.quote && ["quantitative", "integration", "previous_funding"].includes(x.kind) && x.section)!;
    c.quote = `${c.quote} and guarantees zero exploits forever`;
    const r = await auditDataset(t, manifest);
    expect(r.failures.some((f) => f.startsWith(`[quote_verbatim] ${c.id}`))).toBe(true);
  });

  it("fails when a pledge claim names the wrong amount", async () => {
    const t = clone(d);
    const c = t.claims.find((x) => x.kind === "funding_pledge")!;
    c.assertion = c.assertion.replace(/\$[\d,]+(\.\d\d)?/, "$9,999,999");
    const r = await auditDataset(t, manifest);
    expect(r.failures.some((f) => f.startsWith(`[pledge_claim_matches_source] ${c.id}`))).toBe(true);
  });

  it("fails when a claim is marked verified without successful supporting evidence", async () => {
    const t = clone(d);
    const c = t.claims.find((x) => x.status === "applicant_reported" || x.status === "not_independently_verified")!;
    c.status = "independently_verified";
    c.supportingEvidenceIds = [];
    const r = await auditDataset(t, manifest);
    expect(r.failures.some((f) => f.startsWith(`[verified_has_support] ${c.id}`))).toBe(true);
  });

  it("fails when a claim references missing evidence", async () => {
    const t = clone(d);
    t.claims[0]!.evidenceIds = [...t.claims[0]!.evidenceIds, "ev_missing"];
    const r = await auditDataset(t, manifest);
    expect(r.failures).toContain(`[evidence_exists] ${t.claims[0]!.id} → ev_missing`);
  });
});
