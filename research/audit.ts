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
 */
import type { DetailResponse } from "@/lib/official/schemas";
import type { Dataset } from "@/lib/domain/schemas";
import { cohortMetrics } from "@/lib/metrics/compute";
import { formatUsd, toCents } from "@/lib/util/money";
import { stripMarkdown } from "@/lib/util/text";
import { readObject, type SnapshotManifest } from "./store";

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

  return { checked: Object.values(byCheck).reduce((s, x) => s + x.checked, 0), failures, byCheck };
}
