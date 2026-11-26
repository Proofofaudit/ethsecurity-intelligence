/**
 * Official ingestion: ballot list -> schema validation -> cohort check -> details,
 * comments and immutable revisions -> content-addressed snapshot manifest.
 *
 * Safety rules:
 *  - The ballot response's `totals` cover every approved initiative and are never used.
 *  - The frozen cohort (data/cohort.json) is the research scope. New ballot entries are
 *    flagged, never added; cohort members that leave the ballot are kept and flagged.
 *  - A failed detail fetch reuses the last known-good object (marked stale). If no prior
 *    object exists the snapshot is marked invalid and is never published.
 */
import path from "node:path";
import { fetchBallot, fetchComments, fetchDetail, fetchRevision, officialUrls } from "@/lib/official/client";
import type { DetailResponse, ListResponse } from "@/lib/official/schemas";
import { mapLimit } from "@/lib/util/http";
import { contentHash } from "@/lib/util/hash";
import {
  DATA_DIR,
  REVISIONS_DIR,
  SNAPSHOTS_DIR,
  ensureDirs,
  latestValidSnapshot,
  readJson,
  readObject,
  writeJson,
  writeObject,
  type SnapshotManifest,
} from "./store";

export interface Cohort {
  frozenAt: string;
  source: string;
  note: string;
  members: { id: string; slug: string; title: string }[];
}

export const COHORT_FILE = path.join(DATA_DIR, "cohort.json");
export const EXPECTED_COHORT_SIZE = 55;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function loadCohort(): Promise<Cohort | null> {
  return readJson<Cohort>(COHORT_FILE);
}

export interface IngestOptions {
  concurrency?: number;
  /** Delay between requests per worker, to stay gentle on TheDAO infrastructure. */
  delayMs?: number;
  log?: (msg: string) => void;
  /** Allow freezing a cohort of a size other than 55 (tests only). */
  expectedSize?: number;
}

export async function ingest(opts: IngestOptions = {}): Promise<SnapshotManifest> {
  const log = opts.log ?? ((m: string) => console.log(m));
  const concurrency = opts.concurrency ?? 3;
  const delayMs = opts.delayMs ?? 150;
  const expectedSize = opts.expectedSize ?? EXPECTED_COHORT_SIZE;
  await ensureDirs();
  const startedAt = new Date().toISOString();
  const failedRequests: { url: string; error: string }[] = [];
  const validation: { check: string; ok: boolean; detail: string }[] = [];
  let requests = 0;
  const previous = await latestValidSnapshot();

  // 1–2. Ballot list + schema validation (throws on invalid; nothing is written).
  log("Fetching ballot list…");
  requests++;
  const { data: ballot } = await fetchBallot();
  validation.push({ check: "ballot_schema", ok: true, detail: `schemaVersion ${ballot.schemaVersion}, count ${ballot.count}` });

  // 3. Unique identifiers.
  const slugs = ballot.initiatives.map((i) => i.slug);
  const uniqueSlugs = new Set(slugs);
  validation.push({
    check: "unique_slugs",
    ok: uniqueSlugs.size === slugs.length,
    detail: `${uniqueSlugs.size} unique of ${slugs.length}`,
  });
  validation.push({
    check: "count_matches_array",
    ok: ballot.count === ballot.initiatives.length,
    detail: `count=${ballot.count}, array=${ballot.initiatives.length}`,
  });
  validation.push({
    check: "all_status_ballot",
    ok: ballot.initiatives.every((i) => i.status === "ballot"),
    detail: [...new Set(ballot.initiatives.map((i) => i.status))].join(","),
  });

  // 5–6. Details + comments with bounded concurrency.
  const prevObjects = previous?.initiatives ?? {};
  const details = new Map<string, { detail: DetailResponse; hash: string; comments: string | null; fetchedAt: string; stale: boolean }>();
  await mapLimit(ballot.initiatives, concurrency, async (item) => {
    await sleep(delayMs);
    requests++;
    try {
      const detail = await fetchDetail(item.slug);
      const hash = await writeObject(detail);
      let commentsHash: string | null = null;
      try {
        requests++;
        await sleep(delayMs);
        const comments = await fetchComments(item.slug);
        commentsHash = await writeObject(comments);
      } catch (err) {
        failedRequests.push({ url: officialUrls.comments(item.slug), error: String(err instanceof Error ? err.message : err) });
        commentsHash = prevObjects[item.slug]?.comments ?? null;
      }
      details.set(item.slug, { detail, hash, comments: commentsHash, fetchedAt: new Date().toISOString(), stale: false });
    } catch (err) {
      failedRequests.push({ url: officialUrls.initiative(item.slug), error: String(err instanceof Error ? err.message : err) });
      const prev = prevObjects[item.slug];
      if (prev) {
        const detail = await readObject<DetailResponse>(prev.detail);
        details.set(item.slug, { detail, hash: prev.detail, comments: prev.comments, fetchedAt: prev.detailFetchedAt, stale: true });
        log(`  ! ${item.slug}: using last known-good detail (stale)`);
      }
    }
  });
  validation.push({
    check: "details_complete",
    ok: details.size === ballot.initiatives.length,
    detail: `${details.size}/${ballot.initiatives.length} details available (${[...details.values()].filter((d) => d.stale).length} stale)`,
  });

  // 4. Cohort membership. Freeze on first successful run.
  let cohort = await loadCohort();
  const idBySlug = new Map([...details.entries()].map(([slug, d]) => [slug, d.detail.initiative.id]));
  if (!cohort) {
    if (ballot.initiatives.length !== expectedSize || details.size !== ballot.initiatives.length) {
      throw new Error(`Refusing to freeze cohort: expected ${expectedSize} complete records, got ${details.size}/${ballot.initiatives.length}`);
    }
    cohort = {
      frozenAt: startedAt,
      source: officialUrls.ballot(),
      note: "Research cohort frozen from the first validated ballot snapshot. Changes in ballot eligibility are flagged, never silently applied.",
      members: ballot.initiatives
        .map((i) => ({ id: idBySlug.get(i.slug) as string, slug: i.slug, title: i.title }))
        .sort((a, b) => a.title.localeCompare(b.title)),
    };
    await writeJson(COHORT_FILE, cohort);
    log(`Froze research cohort of ${cohort.members.length} initiatives.`);
  }
  const cohortIds = new Set(cohort.members.map((m) => m.id));
  const ballotIds = new Set([...idBySlug.values()]);
  const added = [...ballotIds].filter((id) => !cohortIds.has(id));
  const missing = [...cohortIds].filter((id) => !ballotIds.has(id));
  validation.push({
    check: "cohort_membership",
    ok: added.length === 0 && missing.length === 0,
    detail: `cohort ${cohortIds.size}; new on ballot (not added): ${added.length}; cohort members not on ballot: ${missing.length}`,
  });
  validation.push({
    check: "detail_onBallot",
    ok: [...details.values()].every((d) => d.detail.onBallot),
    detail: `${[...details.values()].filter((d) => d.detail.onBallot).length}/${details.size} report onBallot=true`,
  });

  // Cohort members that are no longer on the ballot list: fetch their detail directly so we can
  // keep researching them and show the eligibility change.
  for (const id of missing) {
    const m = cohort.members.find((x) => x.id === id);
    if (!m) continue;
    try {
      requests++;
      const detail = await fetchDetail(m.slug);
      const hash = await writeObject(detail);
      details.set(m.slug, { detail, hash, comments: null, fetchedAt: new Date().toISOString(), stale: false });
    } catch (err) {
      failedRequests.push({ url: officialUrls.initiative(m.slug), error: String(err) });
      const prev = prevObjects[m.slug];
      if (prev) details.set(m.slug, { detail: await readObject(prev.detail), hash: prev.detail, comments: prev.comments, fetchedAt: prev.detailFetchedAt, stale: true });
    }
  }

  // Internal consistency checks between the list and the detail endpoint.
  const inconsistencies: string[] = [];
  for (const item of ballot.initiatives) {
    const d = details.get(item.slug)?.detail;
    if (!d) continue;
    if (Math.round(d.initiative.goalUsd * 100) !== Math.round(item.goalUsd * 100)) inconsistencies.push(`${item.slug}: goal list≠detail`);
    if (Math.round(d.summary.total * 100) !== Math.round(item.raisedUsd * 100)) inconsistencies.push(`${item.slug}: raised list≠detail`);
    const msSum = d.initiative.milestones.reduce((s, m) => s + Math.round(m.amount * 100), 0);
    if (msSum !== Math.round(d.initiative.goalUsd * 100)) inconsistencies.push(`${item.slug}: milestones ${msSum / 100} ≠ goal ${d.initiative.goalUsd}`);
    // Verified 2026-11-26: total = outstanding pledges + confirmed donations. "Received" pledges
    // arrive as onchain donations and are therefore already inside `donated` (never add them again).
    const parts = Math.round(d.summary.pledged * 100) + Math.round(d.summary.donated * 100);
    if (parts !== Math.round(d.summary.total * 100)) inconsistencies.push(`${item.slug}: pledged+donated ≠ total`);
    if (Math.round(d.summary.received * 100) > Math.round(d.summary.donated * 100)) inconsistencies.push(`${item.slug}: received pledges exceed confirmed donations`);
    const plSum = d.pledges.filter((p) => p.status === "pledged").reduce((s, p) => s + Math.round(p.amountUsd * 100), 0);
    if (plSum !== Math.round(d.summary.pledged * 100)) inconsistencies.push(`${item.slug}: pledge rows ≠ summary.pledged`);
  }
  validation.push({
    check: "list_detail_consistency",
    ok: inconsistencies.length === 0,
    detail: inconsistencies.length ? inconsistencies.slice(0, 10).join("; ") : "goal, raised, milestone sums and pledge sums reconcile",
  });

  // Revisions: immutable, fetched once per (slug, n).
  log("Fetching revisions not yet stored…");
  const revTasks: { slug: string; n: number }[] = [];
  for (const [slug, d] of details) {
    for (const r of d.detail.revisions) {
      const file = path.join(REVISIONS_DIR, d.detail.initiative.id, `${r.n}.json`);
      if ((await readJson(file)) === null) revTasks.push({ slug, n: r.n });
    }
  }
  await mapLimit(revTasks, concurrency, async ({ slug, n }) => {
    await sleep(delayMs);
    requests++;
    try {
      const rev = await fetchRevision(slug, n);
      const id = details.get(slug)?.detail.initiative.id as string;
      await writeJson(path.join(REVISIONS_DIR, id, `${n}.json`), rev);
    } catch (err) {
      failedRequests.push({ url: officialUrls.revision(slug, n), error: String(err instanceof Error ? err.message : err) });
    }
  });
  log(`  fetched ${revTasks.length - failedRequests.filter((f) => f.url.includes("/revisions/")).length}/${revTasks.length} new revisions`);

  const ballotObject = await writeObject(stripTotals(ballot));
  const criticalOk = validation.filter((v) => ["ballot_schema", "unique_slugs", "count_matches_array"].includes(v.check)).every((v) => v.ok);
  const complete = [...cohortIds].every((id) => [...details.values()].some((d) => d.detail.initiative.id === id));
  const snapshotId = `${startedAt.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}-${contentHash({ ballotObject, d: [...details.values()].map((d) => d.hash).sort() }).slice(0, 8)}`;
  const manifest: SnapshotManifest = {
    snapshotId,
    createdAt: startedAt,
    officialGeneratedAt: ballot.generatedAt,
    previousSnapshotId: previous?.snapshotId ?? null,
    ballotObject,
    initiatives: Object.fromEntries(
      [...details.entries()].map(([slug, d]) => [
        slug,
        { id: d.detail.initiative.id, detail: d.hash, comments: d.comments, detailFetchedAt: d.fetchedAt, stale: d.stale },
      ]),
    ),
    requests,
    failedRequests,
    validation,
    status: criticalOk && complete ? "valid" : "invalid",
  };
  await writeJson(path.join(SNAPSHOTS_DIR, `${snapshotId}.json`), manifest);
  log(`Snapshot ${snapshotId}: ${manifest.status} (${requests} requests, ${failedRequests.length} failed)`);
  for (const v of validation) log(`  [${v.ok ? "ok" : "!!"}] ${v.check}: ${v.detail}`);
  return manifest;
}

/** The ballot `totals` block covers all approved initiatives, not the cohort. Keep it but mark it. */
function stripTotals(ballot: ListResponse) {
  return { ...ballot, totals: { ...ballot.totals, _scope: "all approved initiatives — NOT the ballot cohort; never used for cohort metrics" } };
}
