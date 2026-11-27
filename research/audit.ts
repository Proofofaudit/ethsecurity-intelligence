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
 * 11. TheDAO ask per initiative and its cohort sum, recomputed from the raw ballot list; totals
 *     cover the cohort only; the vote section (pool conversion, schedule, slug/project alignment
 *     and affiliation groups) agrees with the raw vote manifest object.
 * 12. Round 1 history: every record figure re-parsed from the stored raw copies, 135 records,
 *     every match with a reason that holds on the raw data, and match lists reproducible.
 * 13. Evidence card: the same six sections in the same order for every initiative; every item has
 *     an http(s) source URL and a checked-on date; funding figures and backers equal the raw
 *     official record; repository, product and site facts equal the stored research results;
 *     broken-link flags follow the stored checks; self-pledge flags are recomputed independently;
 *     no private contact detail appears; "Not found" items agree with the data.
 */
import type { DetailResponse, ListResponse, VoteManifestResponse } from "@/lib/official/schemas";
import type { Dataset } from "@/lib/domain/schemas";
import { cohortMetrics } from "@/lib/metrics/compute";
import type { RevisionResponse } from "@/lib/official/schemas";
import { collaboration, coverage, evidenceCard, fundingRelationships, plainExplanation, realityVsPromises, simulatePortfolio } from "@/lib/intelligence/service";
import { EVIDENCE_CARD_SECTIONS, NO_LINKS_TEXT, type CardItem } from "@/lib/intelligence/evidence-card";
import { SELF_PLEDGE_LABEL } from "@/lib/intelligence/self-pledge";
import { formatUsd, toCents } from "@/lib/util/money";
import { stripMarkdown } from "@/lib/util/text";
import path from "node:path";
import { DATA_DIR, readJson, readObject, RESEARCH_DIR, REVISIONS_DIR, type SnapshotManifest } from "./store";
import type { RepoFacts } from "./github";
import type { CuratedAlias } from "@/lib/domain/identity";
import { computeRound1Matches, expandNames, givethProjectSlug, isSharedHost, nameKey, parseUrl, round1Slug, round1TransparencyUrl } from "@/lib/intelligence/round1";
import {
  decimalToCents,
  extractBundleExtras,
  extractCsvFromBundle,
  parseForumTopic,
  parseRound1,
  parseRound1Csv,
  parseTransparencyTable,
  parseTransparencyTotals,
  readRound1Manifest,
  readRound1Raw,
  ROUND1_EXPECTED_ROWS,
} from "./round1";

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

  // 11. TheDAO ask, cohort-only totals and the vote manifest, recomputed from raw objects.
  const ballot = await readObject<ListResponse>(manifest.ballotObject);
  const rawBallot = new Map(ballot.initiatives.map((i) => [i.slug, i]));
  const CAP = 200_000 * 100;
  let rawAskSum = 0;
  let rawGapSum = 0;
  for (const ini of d.initiatives) {
    const b = rawBallot.get(ini.slug);
    tick("ballot_record_present", !!b, `${ini.slug} missing from the raw ballot list`);
    if (!b) continue;
    const goal = Math.round(b.goalUsd * 100);
    const raised = Math.round(b.raisedUsd * 100);
    const ask = Math.min(CAP, Math.max(0, goal - raised));
    rawAskSum += ask;
    rawGapSum += Math.max(0, goal - raised);
    tick("thedao_ask", ini.funding.theDaoAskCents === ask, `${ini.slug}: TheDAO ask ${formatUsd(ini.funding.theDaoAskCents)} ≠ raw ${formatUsd(ask)}`);
    tick("remaining_gap", ini.funding.remainingCents === Math.max(0, goal - raised), `${ini.slug}: remaining funding gap differs from raw goal − raised`);
  }
  tick("cohort_thedao_ask", m["cohort.thedao_ask"]?.value === rawAskSum, `cohort TheDAO ask ${formatUsd(m["cohort.thedao_ask"]?.value)} ≠ raw ${formatUsd(rawAskSum)}`);
  tick("cohort_remaining_gap", m["cohort.remaining"]?.value === rawGapSum, "cohort remaining funding gap differs from raw");
  // Totals cover exactly the cohort: same ids as the cohort record, each a ballot initiative.
  const cohortIds = new Set(d.meta.cohort.ids);
  tick(
    "cohort_only_totals",
    d.initiatives.length === cohortIds.size && d.initiatives.every((i) => cohortIds.has(i.id) && rawBallot.has(i.slug)),
    "published initiatives differ from the cohort, so totals would not be cohort-only",
  );

  const v = d.vote;
  const rawVote = manifest.vote?.object ? (await readObject<VoteManifestResponse>(manifest.vote.object)).manifest : null;
  tick("vote_present", (rawVote === null) === (v.status === "unavailable"), `vote status ${v.status} but raw manifest ${rawVote ? "present" : "absent"}`);
  if (rawVote) {
    tick("vote_pool_raw", v.poolMicroUsd === rawVote.poolUsd, "poolMicroUsd differs from the raw manifest poolUsd");
    // Independent string conversion: six decimals, cents are the first two.
    const s = rawVote.poolUsd.padStart(7, "0");
    const exact = /0000$/.test(s);
    const cents = exact ? Number(s.slice(0, -4)) : null;
    tick("vote_pool_cents", v.poolCents === cents, `poolCents ${v.poolCents} ≠ ${cents} from poolUsd ${rawVote.poolUsd}`);
    tick("vote_pool_metric", m["cohort.thedao_pool"]?.value === cents, "cohort.thedao_pool differs from the raw pool");
    tick(
      "vote_schedule",
      !!v.schedule &&
        v.schedule.opensAt === rawVote.schedule.opensAt &&
        JSON.stringify(v.schedule.firstTallyAt) === JSON.stringify(rawVote.schedule.firstTallyAt) &&
        v.schedule.initialWindow === rawVote.schedule.initialWindow &&
        v.schedule.maxWindows === rawVote.schedule.maxWindows &&
        v.opensAt === rawVote.opensAt && v.closesAt === rawVote.closesAt,
      "schedule differs from the raw manifest",
    );
    tick("vote_ballot_rules", v.ballotRules === (rawVote.ballotRules ?? null) && v.configRevision === (rawVote.configRevision ?? null), "ballotRules or configRevision differs from the raw manifest");
    tick("vote_arrays", JSON.stringify(v.slugs) === JSON.stringify(rawVote.slugs) && JSON.stringify(v.groups) === JSON.stringify(rawVote.groups), "slugs or groups differ from the raw manifest");
    // Alignment recomputed from raw objects: projects[i] belongs to slugs[i] when the registered goal matches.
    const bySlug = new Map(d.initiatives.map((i) => [i.slug, i]));
    let aligned = rawVote.slugs.length === rawVote.projects.length && rawVote.slugs.length === d.initiatives.length && new Set(rawVote.slugs).size === rawVote.slugs.length;
    rawVote.slugs.forEach((slug, i) => {
      const p = rawVote.projects[i];
      const b = rawBallot.get(slug);
      if (!p || !b || !bySlug.has(slug) || BigInt(p.goalUsd) !== BigInt(Math.round(b.goalUsd * 100)) * 10_000n || p.rfp !== (b.type === "rfp")) aligned = false;
    });
    tick("vote_alignment", aligned === (v.status === "aligned") && aligned === v.groupsAvailable, `recomputed alignment ${aligned}, published status ${v.status}`);
    if (aligned)
      rawVote.slugs.forEach((slug, i) => {
        const ini = bySlug.get(slug);
        const names = (rawVote.projects[i]?.groups ?? []).map((g) => rawVote.groups[g]);
        tick("vote_groups", !!ini && JSON.stringify(v.initiativeGroups[ini.id]) === JSON.stringify(names), `${slug}: published groups differ from raw projects[${i}].groups`);
      });
    else tick("vote_groups_withheld", Object.keys(v.initiativeGroups).length === 0, "groups published although alignment failed");
  }

  await auditRound1(d, tick);
  await auditEvidenceCards(d, raw, tick);

  return { checked: Object.values(byCheck).reduce((s, x) => s + x.checked, 0), failures, byCheck };
}

type Tick = (check: string, ok: boolean, msg: string) => void;

/**
 * 12. Round 1 history. Every published record is re-parsed from the stored raw copies (CSV in the
 * route bundle, server-rendered table, grant object, forum JSON); every match cites a reason whose
 * evidence holds on the raw and official data; the match lists equal a fresh recomputation, so no
 * record was added or dropped by hand.
 */
async function auditRound1(d: Dataset, tick: Tick) {
  const r1 = d.round1;
  const manifest = await readRound1Manifest();
  const raw = manifest ? await readRound1Raw(manifest) : null;
  tick("round1_present", (r1.status === "available") === !!raw, `round1 status ${r1.status} but raw copies ${raw ? "present" : "absent"}`);
  if (!raw || !manifest || r1.status !== "available") return;
  tick("round1_sources", JSON.stringify(r1.sources) === JSON.stringify(manifest.sources), "round1 sources differ from the raw manifest");
  const html = manifest.sources.find((s) => s.key === "transparency_html");
  tick("round1_checked_at", r1.checkedAt === html?.retrievedAt, "round1 checkedAt differs from the retrieval time of the raw page");

  const csv = parseRound1Csv(extractCsvFromBundle(raw.route));
  const table = new Map(parseTransparencyTable(raw.html).map((x) => [x.name, x]));
  const extras = new Map(extractBundleExtras(raw.route).map((x) => [x.name, x]));
  tick("round1_row_count", csv.length === ROUND1_EXPECTED_ROWS && r1.projects.length === csv.length && table.size === csv.length, `round1: ${r1.projects.length} published, ${csv.length} raw CSV rows, ${table.size} table rows`);
  const totals = parseTransparencyTotals(raw.html);
  tick("round1_page_totals", JSON.stringify(r1.pageTotals) === JSON.stringify(totals), "round1 page totals differ from the raw page");
  const published = new Map(r1.projects.map((p) => [p.name, p]));
  for (const row of csv) {
    const p = published.get(row.name);
    const t = table.get(row.name);
    const ex = extras.get(row.name);
    tick(
      "round1_figures",
      !!p &&
        p.totalEth === row.total &&
        p.usdWhenSentCents === decimalToCents(row.usdSent) &&
        p.components.matchingPoolEth === row.matchingPool &&
        p.components.extraRoundInflowEth === row.extraRoundInflow &&
        p.components.otherDonorsEth === row.otherDonors &&
        p.components.otherDonorsUsdCents === decimalToCents(row.otherDonorsUsd) &&
        // QF total = TheDAO matching pool + community-raised matching + direct donations.
        Math.abs(Number(row.matchingPool) + Number(row.extraRoundInflow) + Number(row.otherDonors) - Number(row.total)) < 0.00051,
      `round1 ${row.name}: published figures differ from the raw CSV`,
    );
    if (!p) continue;
    tick(
      "round1_links",
      p.website === (row.link || null) && p.progressUpdateUrl === (row.progressUpdate || null) && p.transparencyUrl === round1TransparencyUrl(row.name) && p.sourceUrls.includes(p.transparencyUrl),
      `round1 ${row.name}: website, progress update or record URL differs from the raw CSV`,
    );
    tick(
      "round1_displayed",
      !!t && p.displayed.totalEth === t.totalEth.replace(/,/g, "") && p.displayed.usdWhenSentCents === decimalToCents(t.usd) && p.displayed.asOf === r1.checkedAt && p.checkedAt === r1.checkedAt,
      `round1 ${row.name}: displayed total differs from the raw table`,
    );
    tick(
      "round1_grants",
      JSON.stringify(p.directGrants) === JSON.stringify((ex?.grants ?? []).map((g) => ({ amountEth: g.amountEth, amountUsdCents: decimalToCents(g.amountUsd), txHash: g.txHash }))) &&
        (p.liveStream?.receiver ?? null) === (ex?.receiver ?? null),
      `round1 ${row.name}: direct grants or stream differ from the raw bundle`,
    );
  }
  const round = raw.forum ? parseForumTopic(raw.forum) : null;
  tick("round1_forum", !round || JSON.stringify(r1.round) === JSON.stringify(round), "round1 round facts differ from the raw forum topic");

  // Reasons hold on the raw and official data.
  const aliases = (await readJson<CuratedAlias[]>(path.join(DATA_DIR, "curated", "aliases.json"))) ?? [];
  const rawByName = new Map(csv.map((x) => [round1TransparencyUrl(x.name), x]));
  const orgs = new Map(d.organizations.map((o) => [o.id, o]));
  const host = (u: string | null | undefined) => parseUrl(u)?.host ?? null;
  const verify = (label: string, inis: Dataset["initiatives"], org: Dataset["organizations"][number] | undefined, ms: Dataset["round1"]["initiativeMatches"][string]) => {
    const orgList = [org, ...inis.map((i) => (i.organizationId ? orgs.get(i.organizationId) : undefined))].filter((o): o is NonNullable<typeof o> => !!o && !o.anonymous);
    const officialUrls = new Set(
      [
        ...inis.map((i) => i.recipientUrl),
        ...orgList.flatMap((o) => [o.website, o.github ? `https://github.com/${o.github}` : null, ...d.initiatives.filter((i) => i.organizationId === o.id).map((i) => i.recipientUrl)]),
      ].filter((u): u is string => !!u),
    );
    const proposalLinks = new Set(inis.flatMap((i) => [...i.links.flatMap((l) => l.split(/\s+/)), ...i.textLinks.map((l) => l.url)]).map((u) => u.replace(/\/+$/, "").toLowerCase()));
    const names = expandNames([...inis.map((i) => i.recipientTeam), ...orgList.flatMap((o) => [o.name, ...o.names])].filter((n): n is string => !!n), aliases);
    for (const m of ms) {
      const row = rawByName.get(m.transparencyUrl);
      tick("round1_match_record", !!row && row.name === m.round1ProjectName && m.checkedAt === r1.checkedAt && m.sourceUrls.includes(m.transparencyUrl), `${label} → ${m.round1ProjectName}: record, date or source URL missing`);
      tick("round1_match_reason", m.reasons.length > 0, `${label} → ${m.round1ProjectName}: no stated reason`);
      if (!row) continue;
      const segs = [row.name, row.name.split(/\s*:\s*|\s+-\s+|\s+\|\s+|\s+–\s+/)[0] ?? "", ...(/^(.*?)\s+by\s+(.+)$/i.exec(row.name)?.slice(1) ?? [])].map(nameKey);
      for (const reason of m.reasons) {
        const cited = reason.sourceUrls.find((u) => officialUrls.has(u)) ?? null;
        const linkHost = host(row.link);
        let holds = false;
        switch (reason.rule) {
          case "proposal_links_record":
            holds = proposalLinks.has(m.transparencyUrl.toLowerCase());
            break;
          case "proposal_links_giveth_project":
            holds = reason.sourceUrls.some((u) => proposalLinks.has(u.replace(/\/+$/, "").toLowerCase()) && round1Slug(givethProjectSlug(u) ?? "") === round1Slug(row.name));
            break;
          case "same_website":
          case "same_website_page":
            holds = !!cited && !!linkHost && host(cited) === linkHost && !isSharedHost(linkHost) && (reason.rule === "same_website" || parseUrl(cited)?.path === parseUrl(row.link)?.path);
            break;
          case "same_github_owner":
          case "same_github_repo": {
            const a = parseUrl(cited);
            const b = parseUrl(row.link);
            holds = a?.host === "github.com" && b?.host === "github.com" && a.segments[0]?.toLowerCase() === b.segments[0]?.toLowerCase() && (reason.rule === "same_github_owner" || a.segments[1]?.toLowerCase() === b.segments[1]?.toLowerCase());
            break;
          }
          case "same_x_account": {
            const a = parseUrl(cited);
            const b = parseUrl(row.link);
            holds = !!a && !!b && /^(x|twitter)\.com$/.test(a.host) && /^(x|twitter)\.com$/.test(b.host) && a.segments[0]?.toLowerCase() === b.segments[0]?.toLowerCase();
            break;
          }
          case "same_organization_name":
            holds = names.some((n) => reason.text.includes(`"${n.name}"`) && segs.includes(nameKey(n.name)));
            break;
          case "shared_name_token":
          case "proposal_links_website":
            holds = m.status === "possible";
            break;
        }
        tick("round1_reason_holds", holds, `${label} → ${m.round1ProjectName}: reason "${reason.text}" does not hold on the raw data`);
      }
      const confirming = m.reasons.filter((x) => x.rule !== "shared_name_token" && x.rule !== "proposal_links_website");
      tick("round1_status", (m.status === "match") === confirming.length > 0, `${label} → ${m.round1ProjectName}: status ${m.status} does not follow from its reasons`);
    }
  };
  for (const ini of d.initiatives) verify(ini.slug, [ini], undefined, r1.initiativeMatches[ini.id] ?? []);
  for (const o of d.organizations) verify(o.id, d.initiatives.filter((i) => o.initiativeIds.includes(i.id)), o, r1.organizationMatches[o.id] ?? []);

  // Completeness: the published lists equal a fresh run of the matcher on the raw records.
  const fresh = computeRound1Matches(parseRound1(raw, r1.checkedAt ?? "").projects, d.initiatives, d.organizations, aliases);
  tick("round1_matches_reproducible", JSON.stringify(fresh.initiativeMatches) === JSON.stringify(r1.initiativeMatches), "round1 initiative matches differ from a fresh run on the raw records");
  tick("round1_org_matches_reproducible", JSON.stringify(fresh.organizationMatches) === JSON.stringify(r1.organizationMatches), "round1 organization matches differ from a fresh run on the raw records");
}

/** Word tokens after folding case, accents and punctuation (independent of lib/intelligence/self-pledge.ts). */
function words(s: string): string[] {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}
function containsRun(hay: string[], needle: string[]): boolean {
  if (!needle.length || needle.join("").length < 3) return false;
  for (let i = 0; i + needle.length <= hay.length; i++) if (needle.every((w, j) => hay[i + j] === w)) return true;
  return false;
}

/** Stored GitHub results (data/research/results/github), newest check per repository URL. */
async function storedGithubRepos(d: Dataset): Promise<Map<string, RepoFacts>> {
  const out = new Map<string, RepoFacts>();
  for (const ini of d.initiatives) {
    const res = await readJson<{ repos: RepoFacts[] }>(path.join(RESEARCH_DIR, "results", "github", `${ini.id}.json`));
    for (const r of res?.repos ?? []) {
      const k = r.url.toLowerCase();
      const prev = out.get(k);
      if (!prev || prev.checkedAt < r.checkedAt) out.set(k, r);
    }
  }
  return out;
}

/** 13. Evidence card facts against their source records. */
async function auditEvidenceCards(d: Dataset, raw: Map<string, DetailResponse>, tick: Tick) {
  const keys = EVIDENCE_CARD_SECTIONS.map((s) => s.key).join(",");
  const repos = new Map(d.repositories.map((r) => [r.id, r]));
  const stored = await storedGithubRepos(d);
  const products = new Map(d.products.map((p) => [p.id, p]));
  for (const ini of d.initiatives) {
    const card = evidenceCard(d, ini.id);
    const r = raw.get(ini.id);
    tick("card_present", !!card && !!r, `${ini.slug}: no evidence card or raw record`);
    if (!card || !r) continue;
    tick("card_layout", card.sections.map((s) => s.key).join(",") === keys, `${ini.slug}: evidence card sections differ from the shared layout`);
    const items = card.sections.flatMap((s) => s.items);
    const sec = (k: string): CardItem[] => card.sections.find((s) => s.key === k)?.items ?? [];
    for (const i of items) {
      tick("card_source", /^https?:\/\//.test(i.sourceUrl) && Number.isFinite(Date.parse(i.checkedAt)), `${ini.slug}/${i.key}: missing source URL or checked-on date`);
      tick("card_link", i.link === null || /^https?:\/\//.test(i.link) || i.link === "#round1", `${ini.slug}/${i.key}: link ${i.link} is not http(s)`);
      const text = `${i.value} ${i.link ?? ""}`;
      tick("card_private_contact", !/mailto:|tel:|\bt\.me\/|wa\.me\/|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text), `${ini.slug}/${i.key}: private contact detail in the evidence card`);
    }
    // Funding: three official figures, separate, equal to the raw record.
    const fig = (k: string) => sec("funding").find((i) => i.key === k)?.amountCents;
    tick("card_pledged", fig("pledged") === toCents(r.summary.pledged), `${ini.slug}: card pledged ≠ raw`);
    tick("card_received", fig("received") === toCents(r.summary.received), `${ini.slug}: card received ≠ raw`);
    tick("card_donated", fig("donated") === toCents(r.summary.donated), `${ini.slug}: card donated ≠ raw`);
    const backers = sec("funding").filter((i) => i.key.startsWith("pledge_"));
    tick("card_backer_count", backers.length === r.pledges.length, `${ini.slug}: ${backers.length} backers on the card, ${r.pledges.length} raw pledges`);
    const org = d.organizations.find((o) => o.id === ini.organizationId);
    const names = [r.initiative.recipientTeam, org?.name, ...(org?.names ?? [])].filter((x): x is string => !!x).map(words);
    for (const b of backers) {
      const rp = r.pledges.find((p) => `pledge_${p.id}` === b.key);
      tick("card_backer", !!rp && rp.company.trim() === b.value.trim() && toCents(rp.amountUsd) === b.amountCents && b.label.includes(rp.status), `${ini.slug}/${b.key}: backer differs from the raw pledge`);
      const expect = names.some((n) => containsRun(words(b.value), n));
      tick("card_self_pledge", expect === (b.flag?.kind === "self_pledge") && (!b.flag || b.flag.text === SELF_PLEDGE_LABEL), `${ini.slug}/${b.key}: self-pledge flag ${!!b.flag} but recomputed ${expect}`);
    }
    // Shipped work: official site, products and repositories equal the stored results.
    const site = sec("shipped").find((i) => i.key === "site");
    tick("card_site", (site?.link ?? null) === ((r.initiative.recipientUrl ?? null) && /^https?:\/\//i.test(r.initiative.recipientUrl ?? "") ? r.initiative.recipientUrl : null), `${ini.slug}: official site differs from raw recipientUrl`);
    for (const i of sec("shipped").filter((x) => x.key.startsWith("product_"))) {
      const p = products.get(i.key.slice("product_".length));
      const state = p?.reachable === true ? null : p?.reachable === false ? "broken" : "inconclusive";
      tick("card_product", !!p && p.url === i.link && i.checkedAt === (p.checkedAt ?? p.provenance.retrievedAt) && (i.flag?.kind ?? null) === state, `${ini.slug}/${i.key}: product facts differ from the stored check`);
    }
    const repoItems = sec("shipped").filter((x) => x.key.startsWith("repo_"));
    tick("card_repo_count", repoItems.length === d.repositories.filter((x) => x.initiativeIds.includes(ini.id)).length, `${ini.slug}: repository count differs`);
    for (const i of repoItems) {
      const rp = repos.get(i.key.slice("repo_".length));
      const ok =
        !!rp &&
        rp.fullName === i.value &&
        rp.url === i.link &&
        rp.checkedAt === i.checkedAt &&
        (!rp.exists ||
          (i.details.includes(rp.license ? `License ${rp.license}` : "No license file detected") &&
            (rp.latestRelease ? i.details.some((x) => x.startsWith(`Latest release ${rp.latestRelease?.tag}`)) : i.details.includes("No release published")) &&
            (rp.commitsLast90d === null || i.details.some((x) => x.startsWith(`${rp.commitsLast90d} commit`))))) &&
        (rp.exists ? i.flag === null : i.flag !== null && (/\b404\b/.test(rp.error ?? "") ? i.flag.kind === "broken" && i.flag.text.startsWith("Repository not found when checked on") : i.flag.kind === "inconclusive"));
      tick("card_repo", ok, `${ini.slug}/${i.key}: repository facts differ from the published repository record`);
      // The published record shown on the card equals the stored GitHub API result.
      const g = rp ? stored.get(rp.url.toLowerCase()) : undefined;
      tick(
        "card_repo_stored",
        !!g && !!rp && g.exists === rp.exists && g.license === rp.license && g.pushedAt === rp.pushedAt && g.latestRelease?.tag === rp.latestRelease?.tag && g.releaseCount === rp.releaseCount && g.commitsLast90d === rp.commitsLast90d && g.archived === rp.archived && g.error === rp.error,
        `${ini.slug}/${i.key}: repository facts differ from the stored GitHub result`,
      );
    }
    // Prior funding: Round 1 record count equals the published matches.
    const r1 = sec("prior").find((i) => i.key === "round1");
    const n = (d.round1.initiativeMatches[ini.id] ?? []).length;
    tick("card_round1", d.round1.status === "unavailable" || (n === 0 ? !r1 : !!r1 && r1.value.startsWith(`See Round 1 history: ${n} `)), `${ini.slug}: Round 1 item differs from ${n} published matches`);
    // Not found agrees with the data.
    const nf = new Set(sec("not_found").map((i) => i.value));
    const anyLinks = ini.links.length + ini.textLinks.length > 0;
    tick("card_no_links", nf.has(NO_LINKS_TEXT) === !anyLinks, `${ini.slug}: "${NO_LINKS_TEXT}" is ${nf.has(NO_LINKS_TEXT)} but the proposal has ${ini.links.length + ini.textLinks.length} links`);
    tick("card_no_repo", nf.has("No public repository linked") === (repoItems.length === 0), `${ini.slug}: repository "Not found" disagrees with ${repoItems.length} repositories`);
    tick("card_no_audit", nf.has("No public audit report linked") === (sec("audits").length === 0), `${ini.slug}: audit "Not found" disagrees with the audits section`);
    tick("card_no_backers", nf.has("No named backers in the official record") === (r.pledges.length === 0), `${ini.slug}: backer "Not found" disagrees with the raw pledges`);
  }
}
