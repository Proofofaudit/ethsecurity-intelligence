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

  it("fails when an evidence card fact differs from its source record", async () => {
    const t = clone(d);
    const repo = t.repositories.find((x) => x.exists && x.license)!;
    repo.license = "Invented-License";
    const pledge = t.pledges[0]!;
    pledge.amountCents += 1;
    const r = await auditDataset(t, manifest);
    expect(r.byCheck.card_repo_stored?.failed).toBeGreaterThan(0);
    expect(r.failures.some((f) => f.startsWith("[card_backer]"))).toBe(true);
    expect(r.byCheck.card_layout?.failed).toBe(0);
  });

  it("fails when a claim is marked verified without successful supporting evidence", async () => {
    const t = clone(d);
    const c = t.claims.find((x) => x.status === "applicant_reported" || x.status === "not_independently_verified")!;
    c.status = "independently_verified";
    c.supportingEvidenceIds = [];
    const r = await auditDataset(t, manifest);
    expect(r.failures.some((f) => f.startsWith(`[verified_has_support] ${c.id}`))).toBe(true);
  });

  it("fails when the ingestion status differs from the snapshot it was published from", async () => {
    const t = clone(d);
    const v = t.meta.ingestion.validation.find((x) => x.check === "list_detail_consistency")!;
    v.ok = !v.ok;
    t.meta.ingestion.failedRequests = [...t.meta.ingestion.failedRequests, { url: "https://initiatives.thedao.fund/api/x", error: "invented" }];
    const r = await auditDataset(t, manifest);
    expect(r.byCheck.status_validation?.failed).toBe(1);
    expect(r.byCheck.status_requests?.failed).toBe(1);
    expect(r.byCheck.status_snapshot?.failed).toBe(0);
    expect(r.byCheck.funding_identity?.failed).toBe(0);
  });

  it("fails when a claim references missing evidence", async () => {
    const t = clone(d);
    t.claims[0]!.evidenceIds = [...t.claims[0]!.evidenceIds, "ev_missing"];
    const r = await auditDataset(t, manifest);
    expect(r.failures).toContain(`[evidence_exists] ${t.claims[0]!.id} → ev_missing`);
  });

  it("checks every Round 1 record and match against the stored raw copies", async () => {
    const r = await auditDataset(d, manifest);
    for (const check of ["round1_figures", "round1_links", "round1_displayed", "round1_grants", "round1_row_count", "round1_match_reason", "round1_reason_holds", "round1_matches_reproducible"]) {
      expect(r.byCheck[check]?.checked, check).toBeGreaterThan(0);
      expect(r.byCheck[check]?.failed, check).toBe(0);
    }
    expect(r.byCheck.round1_figures?.checked).toBe(135);
  });

  it("fails when a Round 1 amount is tampered with", async () => {
    const t = clone(d);
    const p = t.round1.projects.find((x) => x.name === "Revoke.cash")!;
    p.totalEth = "99.0";
    p.usdWhenSentCents += 1;
    const r = await auditDataset(t, manifest);
    expect(r.failures).toContain("[round1_figures] round1 Revoke.cash: published figures differ from the raw CSV");
  });

  it("fails when a Round 1 match has no reason, or a reason that does not hold", async () => {
    const t = clone(d);
    const [iniId, ms] = Object.entries(t.round1.initiativeMatches).find(([, m]) => m.some((x) => x.status === "match"))!;
    const m = ms.find((x) => x.status === "match")!;
    m.reasons = [];
    const slug = t.initiatives.find((i) => i.id === iniId)!.slug;
    const r = await auditDataset(t, manifest);
    expect(r.failures).toContain(`[round1_match_reason] ${slug} → ${m.round1ProjectName}: no stated reason`);
    expect(r.byCheck.round1_matches_reproducible?.failed).toBe(1);

    const u = clone(d);
    const empty = u.initiatives.find((i) => (u.round1.initiativeMatches[i.id] ?? []).length === 0)!;
    const p = u.round1.projects.find((x) => x.name === "L2BEAT")!;
    u.round1.initiativeMatches[empty.id] = [
      { projectId: p.id, round1ProjectName: p.name, transparencyUrl: p.transparencyUrl, website: p.website, level: "organization", status: "match", reasons: [{ rule: "same_website", text: "Listed under the same website (l2beat.com)", sourceUrls: [p.transparencyUrl] }], sourceUrls: [p.transparencyUrl], checkedAt: p.checkedAt },
    ];
    const r2 = await auditDataset(u, manifest);
    expect(r2.failures).toContain(`[round1_reason_holds] ${empty.slug} → L2BEAT: reason "Listed under the same website (l2beat.com)" does not hold on the raw data`);
    expect(r2.byCheck.round1_matches_reproducible?.failed).toBe(1);
  });
});
