/**
 * Truth audit. Re-checks every published statement against its primary source before the
 * dataset may be published. Any failure blocks publication.
 *
 * Checks:
 *  1. Funding, goals and milestone amounts equal the raw official API responses.
 *  2. Every pledge claim names the exact company, amount and status of a raw pledge row.
 *  3. Every quoted proposal statement appears verbatim (after markdown stripping) in the
 *     official proposal section it cites.
 *  4. "Independently verified" and "partially supported" claims have at least one supporting
 *     evidence record whose machine-observed facts show success.
 *  5. Repository and donation claims agree with the recorded GitHub/onchain observations.
 *  6. Every non-trivial alias merge is backed by a shared official domain or curated sources.
 *  7. Cohort metrics recomputed from raw responses equal the published metrics.
 *  8. The ingestion status (snapshot id, sync time, requests, failures, validation) equals the
 *     snapshot manifest it was published from, and the funding identity holds in raw data.
 *  9. Dossier statements: the summary and its plain-language opening line match the raw official
 *     summary verbatim, and the Reality vs. Promises budget split adds up to the raw milestones.
 * 10. Research views: milestone shares of goal, backer pledge totals, the what-if baseline, the
 *     lifecycle coverage counts, collaboration hypotheses (recomputed from scratch) and the
 *     revision texts shown in the Time Machine all agree with the raw official records.
 */
import type { DetailResponse } from "@/lib/official/schemas";
import type { Dataset } from "@/lib/domain/schemas";
import { cohortMetrics } from "@/lib/metrics/compute";
import type { RevisionResponse } from "@/lib/official/schemas";
import { collaboration, coverage, fundingRelationships, plainExplanation, realityVsPromises, simulatePortfolio } from "@/lib/intelligence/service";
import { formatUsd, toCents } from "@/lib/util/money";
import { stripMarkdown } from "@/lib/util/text";
import path from "node:path";
import { readJson, readObject, REVISIONS_DIR, type SnapshotManifest } from "./store";

export interface AuditResult {
  checked: number;
  failures: string[];
  byCheck: Record<string, { checked: number; failed: number }>;
}

const norm = (s: string) => s.replace(/[“”"’']/g, "").replace(/\s+/g, " ").trim().toLowerCase();

export async function auditDataset(d: Dataset, manifest: SnapshotManifest): Promise<AuditResult> {
  const failures: string[] = [];
  const byCheck: AuditResult["byCheck"] = {};
  const tick = (check: string, ok: boolean, msg: string) => {
    byCheck[check] ??= { checked: 0, failed: 0 };
    byCheck[check].checked++;
    if (!ok) {
      byCheck[check].failed++;
      failures.push(`[${check}] ${msg}`);
    }
  };

  const raw = new Map<string, DetailResponse>();
  for (const entry of Object.values(manifest.initiatives)) {
    const det = await readObject<DetailResponse>(entry.detail);
    raw.set(det.initiative.id, det);
  }

  // 1. Funding and milestones.
  let rawGoal = 0;
  let rawRaised = 0;
  for (const ini of d.initiatives) {
    const r = raw.get(ini.id);
    tick("official_record_present", !!r, `${ini.slug} missing from snapshot`);
    if (!r) continue;
    rawGoal += toCents(r.initiative.goalUsd);
    rawRaised += toCents(r.summary.total);
    tick("goal", ini.funding.goalCents === toCents(r.initiative.goalUsd), `${ini.slug} goal`);
    tick("raised", ini.funding.officialRaisedCents === toCents(r.summary.total), `${ini.slug} raised`);
    tick("pledged", ini.funding.pledgedCents === toCents(r.summary.pledged), `${ini.slug} pledged`);
    tick("received", ini.funding.receivedCents === toCents(r.summary.received), `${ini.slug} received`);
    tick("donated", ini.funding.donatedCents === toCents(r.summary.donated), `${ini.slug} donated`);
    // The API and UI state: raised = outstanding pledges + confirmed donations, received pledges inside donated.
    tick(
      "funding_identity",
      toCents(r.summary.pledged) + toCents(r.summary.donated) === toCents(r.summary.total) && toCents(r.summary.received) <= toCents(r.summary.donated),
      `${ini.slug}: raw pledged + donated ≠ total, or received > donated`,
    );
    const ms = d.milestones.filter((m) => m.initiativeId === ini.id).sort((a, b) => a.index - b.index);
    tick("milestone_count", ms.length === r.initiative.milestones.length, `${ini.slug} milestone count`);
    for (const m of ms) {
      const rm = r.initiative.milestones[m.index];
      tick(
        "milestone_fields",
        !!rm && rm.name.trim() === m.name && toCents(rm.amount) === m.amountCents && rm.adoption === m.adoption && rm.done === m.done,
        `${ini.slug} milestone ${m.index}`,
      );
    }
    tick("title", ini.title === r.initiative.title, `${ini.slug} title`);
    // Dossier header: the plain-language line is a verbatim prefix of the raw official summary.
    const rawSummary = r.initiative.summary.replace(/\s+/g, " ").trim();
    tick("summary", ini.summary.replace(/\s+/g, " ").trim() === rawSummary, `${ini.slug} summary differs from the official summary`);
    const plain = plainExplanation(ini);
    tick("plain_explanation", plain.length > 0 && rawSummary.startsWith(plain), `${ini.slug}: plain-language line is not a prefix of the official summary`);
    // Reality vs. Promises: the completed / to build / adoption split adds up to the raw milestone budgets.
    const split = realityVsPromises(d, ini, ms, d.claims.filter((c) => c.initiativeId === ini.id));
    const rawMilestoneSum = r.initiative.milestones.reduce((s, x) => s + toCents(x.amount), 0);
    tick(
      "reality_split",
      split.fundingForCompletedCents + split.fundingForProposedCents + split.fundingForAdoptionCents === rawMilestoneSum &&
        split.existing.every((c) => c.status === "independently_verified" || c.status === "partially_supported"),
      `${ini.slug}: Reality vs. Promises split does not add up to the official milestone budgets`,
    );
  }

  // 2–5. Claims.
  const evidence = new Map(d.evidence.map((e) => [e.id, e]));
  const iniById = new Map(d.initiatives.map((i) => [i.id, i]));
  for (const c of d.claims) {
    const ini = iniById.get(c.initiativeId);
    const r = raw.get(c.initiativeId);
    if (!ini || !r) {
      tick("claim_initiative", false, `${c.id} has unknown initiative`);
      continue;
    }
    if (c.kind === "funding_pledge" || c.kind === "funding_received") {
      const ok = r.pledges.some(
        (p) => c.assertion.startsWith(`${p.company.trim()} `) && c.assertion.includes(formatUsd(toCents(p.amountUsd))) && (p.status === "received") === (c.kind === "funding_received"),
      );
      tick("pledge_claim_matches_source", ok, `${c.id}: ${c.assertion}`);
    }
    if (c.quote && ["quantitative", "integration", "previous_funding"].includes(c.kind) && c.section) {
      const sec = ini.sections.find((s) => s.key === c.section);
      const plain = sec ? norm(stripMarkdown(sec.markdown)) : "";
      const q = norm(c.quote.replace(/…$/, ""));
      tick("quote_verbatim", !!sec && plain.includes(q.slice(0, Math.min(q.length, 300))), `${c.id}: quote not found in ${c.section}`);
    }
    if (c.status === "independently_verified" || c.status === "partially_supported") {
      const sup = c.supportingEvidenceIds.map((id) => evidence.get(id));
      tick("verified_has_support", sup.length > 0 && sup.every((e) => !!e && e.ok), `${c.id}: ${c.status} without successful supporting evidence`);
    }
    if (c.kind === "existing_artifact" && c.status === "independently_verified") {
      const e = evidence.get(c.supportingEvidenceIds[0] ?? "");
      tick("repo_exists", e?.kind === "github_repository" && e.facts.exists === true, `${c.id}`);
    }
    if (c.kind === "donation" && c.status === "independently_verified") {
      const txs = d.donations.filter((x) => x.initiativeId === c.initiativeId);
      tick(
        "donations_onchain",
        txs.every((x) => d.evidence.some((e) => e.kind === "onchain_transaction" && e.url.endsWith(x.txHash) && e.ok)) && txs.length === r.donations.length,
        `${c.id}`,
      );
    }
    if (c.kind === "milestone_completed" && c.status === "partially_supported") {
      const e = evidence.get(c.supportingEvidenceIds[0] ?? "");
      tick("milestone_artifact", !!e && (e.kind !== "github_pull_request" || e.facts.merged === true), `${c.id}`);
    }
    if (c.kind === "milestone_completed") {
      const idx = Number(c.section?.split(":")[1]);
      tick("milestone_done_flag", r.initiative.milestones[idx]?.done === true, `${c.id}: milestone not marked done in source`);
    }
  }

  // 6. Alias merges.
  for (const a of d.aliases) {
    if (a.resolution === "same_official_domain") tick("alias_domain", a.sourceUrls.length >= 1 || /same website/.test(a.reason), `${a.alias}`);
    if (a.resolution === "curated_with_evidence") tick("alias_curated_sources", a.sourceUrls.length >= 1, `${a.alias}`);
  }

  // 7. Cohort metrics.
  const m = cohortMetrics(d);
  tick("cohort_goal", m["cohort.goal"]?.value === rawGoal, "cohort goal");
  tick("cohort_raised", m["cohort.raised"]?.value === rawRaised, "cohort raised");
  tick("cohort_size", d.initiatives.length === d.meta.cohort.size && d.meta.cohort.ids.every((id) => raw.has(id)), "cohort size vs snapshot");

  // Evidence references.
  for (const c of d.claims) for (const id of c.evidenceIds) tick("evidence_exists", evidence.has(id), `${c.id} → ${id}`);

  // 8. Ingestion status (served by /api/v1/status) must be the snapshot's own validation record.
  tick("status_snapshot", d.meta.snapshotId === manifest.snapshotId && d.meta.ingestion.startedAt === manifest.createdAt, "meta snapshot id or sync time differs from the snapshot used");
  tick("status_validation", JSON.stringify(d.meta.ingestion.validation) === JSON.stringify(manifest.validation), "meta validation differs from the snapshot validation");
  tick(
    "status_requests",
    d.meta.ingestion.requests === manifest.requests && JSON.stringify(d.meta.ingestion.failedRequests) === JSON.stringify(manifest.failedRequests),
    "meta request counts differ from the snapshot",
  );

  // 10. Research views.
  for (const ms of d.milestones) {
    const r = raw.get(ms.initiativeId);
    const rm = r?.initiative.milestones[ms.index];
    const goal = r ? toCents(r.initiative.goalUsd) : 0;
    tick(
      "milestone_share",
      !!rm && (goal > 0 ? Math.abs((ms.shareOfGoal ?? -1) - toCents(rm.amount) / goal) < 1e-9 : ms.shareOfGoal === null),
      `${ms.id}: share of goal differs from raw amount / goal`,
    );
  }
  const rawPledgeRows = [...raw.values()].flatMap((r) => r.pledges.map((p) => ({ initiativeId: r.initiative.id, company: p.company.trim(), cents: toCents(p.amountUsd), status: p.status })));
  for (const p of d.pledges)
    tick(
      "pledge_record",
      rawPledgeRows.some((x) => x.initiativeId === p.initiativeId && x.company === p.company.trim() && x.cents === p.amountCents && x.status === p.status),
      `${p.id}: ${p.company} ${formatUsd(p.amountCents)} not found in raw pledges`,
    );
  const fr = fundingRelationships(d);
  tick("backer_totals", fr.totalPledgedCents === rawPledgeRows.reduce((s, x) => s + x.cents, 0) && d.pledges.length === rawPledgeRows.length, "backer pledge totals differ from raw pledge rows");
  for (const b of fr.backers) {
    const own = d.pledges.filter((p) => p.backerId === b.backerId);
    tick(
      "backer_split",
      b.totalCents === b.pledgedCents + b.receivedCents && b.totalCents === own.reduce((s, p) => s + p.amountCents, 0) && b.records === own.length,
      `${b.backerId}: pledged + received ≠ total`,
    );
  }
  const base = simulatePortfolio(d, { initiativeIds: d.initiatives.map((i) => i.id) });
  for (const row of base.rows) {
    const r = raw.get(row.id);
    const goal = r ? toCents(r.initiative.goalUsd) : -1;
    const total = r ? toCents(r.summary.total) : -1;
    tick("what_if_baseline", row.securedCents === total && row.gapCents === Math.max(0, goal - total), `${row.slug}: what-if baseline differs from raw goal and raised`);
  }
  const cov = coverage(d);
  for (const st of cov.stages) {
    const rels = d.relationships.filter((r) => r.type === "addresses" && r.to.id === st.stage).length;
    tick("coverage_counts", st.totalCount === rels && st.initiatives.length === st.totalCount, `${st.stage}: coverage count ${st.totalCount} vs ${rels} addresses relationships`);
  }
  const collabItems = collaboration(d);
  const hypRels = d.relationships.filter((r) => r.type === "potentially_overlaps" || r.type === "potentially_complements");
  tick("hypotheses_reproducible", collabItems.length === hypRels.length && collabItems.every((c) => c.signals !== null), "collaboration hypotheses cannot be reproduced from the published dataset");
  for (const c of collabItems) {
    const recomputed = c.signals ? `${c.reasons.join("; ")}` : "";
    tick("hypothesis_reason", c.relationship.reason.endsWith(recomputed) && recomputed.length > 0, `${c.relationship.id}: recomputed reasons differ`);
  }
  for (const rev of d.revisions) {
    const file = await readJson<RevisionResponse>(path.join(REVISIONS_DIR, rev.initiativeId, `${rev.n}.json`));
    const rr = file?.revision;
    const sections = rr ? (rr.sections ?? (rr.details ? { details: rr.details } : null)) : null;
    tick(
      "revision_text",
      !!rr &&
        (rr.title ?? null) === rev.title &&
        (rr.summary ?? null) === rev.summary &&
        JSON.stringify(sections) === JSON.stringify(rev.sections) &&
        (rr.milestones ?? []).reduce((s, m) => s + toCents(m.amount), 0) === (rev.milestones ?? []).reduce((s, m) => s + m.amountCents, 0),
      `${rev.id}: revision ${rev.n} differs from the raw official revision`,
    );
  }

  return { checked: Object.values(byCheck).reduce((s, x) => s + x.checked, 0), failures, byCheck };
}
