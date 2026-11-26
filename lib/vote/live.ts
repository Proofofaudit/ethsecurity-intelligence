/**
 * Server-side live refresh of the vote manifest's pool and schedule (Item 3).
 *
 * The published dataset is the audited snapshot. On top of it, the server re-reads TheDAO's vote
 * manifest at most once per LIVE_TTL_MS (12 minutes) per server process, shared by every visitor:
 * TheDAO's API is never called per user or per request. A fetched manifest replaces the shown pool
 * and schedule only when it passes the same schema, the same slug/project alignment check against
 * the published cohort and ballot goals, and the schedule check. A failed or invalid fetch never
 * replaces a valid value: the last valid live value (or else the published snapshot) stays, and
 * the failure is reported on the data-freshness page.
 *
 * Affiliation groups, goals and TheDAO asks are not refreshed here; they change only when a new
 * dataset passes the truth audit and is published.
 */
import type { Dataset, VoteSection } from "@/lib/domain/schemas";
import { fetchVoteManifest } from "@/lib/official/client";
import type { VoteManifest, VoteManifestResponse } from "@/lib/official/schemas";
import { checkAlignment, microUsdToCents, scheduleOk, type BallotRecord } from "./manifest";

import { LIVE_TTL_MINUTES, LIVE_TTL_MS } from "./constants";

export { LIVE_TTL_MINUTES, LIVE_TTL_MS };

export interface LiveVoteState {
  /** Where the shown pool and schedule come from. */
  source: "live" | "snapshot";
  /** When the live values shown were fetched; null when the snapshot is shown. */
  fetchedAt: string | null;
  /** Last time the server tried to read the manifest; null when it never tried. */
  checkedAt: string | null;
  /** Why the last read was not used; null when it was. */
  error: string | null;
  /** One sentence for the data-freshness page. */
  note: string;
}

type Fetcher = () => Promise<VoteManifestResponse>;

interface Good {
  manifest: VoteManifest;
  fetchedAt: string;
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

/** Why a fetched manifest may not replace the shown values, or null when it may. */
export function rejectLive(m: VoteManifest, d: Dataset): string | null {
  const cohort = new Map(d.initiatives.map((i) => [i.slug, i.id]));
  const ballot = new Map<string, BallotRecord>(d.initiatives.map((i) => [i.slug, { slug: i.slug, goalCents: i.funding.goalCents, type: i.type }]));
  const a = checkAlignment(m, cohort, ballot);
  if (!a.ok) return `alignment with the published cohort failed (${a.checks.filter((c) => !c.ok).map((c) => c.check).join(", ")})`;
  if (!scheduleOk(m)) return "the schedule is incomplete or out of order";
  if (microUsdToCents(m.poolUsd) === null) return "poolUsd is not a whole number of cents";
  return null;
}

/** The snapshot vote section with the live pool and schedule. Everything else stays as published. */
export function overlayVote(v: VoteSection, m: VoteManifest): VoteSection {
  return {
    ...v,
    poolMicroUsd: m.poolUsd,
    poolCents: microUsdToCents(m.poolUsd),
    opensAt: m.opensAt,
    closesAt: m.closesAt,
    schedule: { opensAt: m.schedule.opensAt, firstTallyAt: [...m.schedule.firstTallyAt], initialWindow: m.schedule.initialWindow, maxWindows: m.schedule.maxWindows },
    scheduleAvailable: true,
  };
}

export function liveVoteEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.ESI_LIVE_MANIFEST === "off") return false;
  // Unit tests and `next build` render from the snapshot only, so outputs stay reproducible.
  if (env.VITEST || env.NEXT_PHASE === "phase-production-build") return false;
  return true;
}

export function createLiveVote(opts: { fetcher?: Fetcher; now?: () => number; ttlMs?: number; enabled?: () => boolean } = {}) {
  // Short timeout and one retry: a page render waits for at most one shared read per TTL.
  const fetcher = opts.fetcher ?? (() => fetchVoteManifest({ timeoutMs: 6_000, retries: 1, backoffMs: 500 }));
  const now = opts.now ?? Date.now;
  const ttl = opts.ttlMs ?? LIVE_TTL_MS;
  const enabled = opts.enabled ?? (() => liveVoteEnabled());
  let good: Good | null = null;
  let checkedAt: number | null = null;
  let lastError: string | null = null;
  let inflight: Promise<void> | null = null;

  async function refresh(d: Dataset) {
    const at = now();
    try {
      const { manifest } = await fetcher();
      const why = rejectLive(manifest, d);
      if (why) lastError = `Live manifest not used: ${why}.`;
      else {
        good = { manifest, fetchedAt: new Date(at).toISOString() };
        lastError = null;
      }
    } catch (e) {
      lastError = `Live manifest read failed: ${errText(e)}`;
    } finally {
      checkedAt = at;
    }
  }

  async function apply(d: Dataset): Promise<{ dataset: Dataset; live: LiveVoteState }> {
    if (!enabled()) {
      return { dataset: d, live: { source: "snapshot", fetchedAt: null, checkedAt: null, error: null, note: "Live refresh is off on this server, so the pool and schedule are those of the published snapshot." } };
    }
    if (checkedAt === null || now() - checkedAt >= ttl) {
      inflight ??= refresh(d).finally(() => {
        inflight = null;
      });
      await inflight;
    }
    const checked = checkedAt !== null ? new Date(checkedAt).toISOString() : null;
    // A valid live read must still fit this dataset (a new publish may have changed the cohort).
    const usable = good && rejectLive(good.manifest, d) === null ? good : null;
    if (!usable) {
      return {
        dataset: d,
        live: { source: "snapshot", fetchedAt: null, checkedAt: checked, error: lastError, note: `Pool and schedule from the published snapshot. The server re-reads the manifest at most every ${LIVE_TTL_MINUTES} minutes.` },
      };
    }
    return {
      dataset: { ...d, vote: overlayVote(d.vote, usable.manifest) },
      live: {
        source: "live",
        fetchedAt: usable.fetchedAt,
        checkedAt: checked,
        error: lastError,
        note: `Pool and schedule from the live manifest, read by this server at most every ${LIVE_TTL_MINUTES} minutes and shared by all visitors.${lastError ? " The latest read was not used, so the last valid read is shown." : ""}`,
      },
    };
  }

  return { apply };
}

const shared = createLiveVote();

/** The published dataset with the cached live pool and schedule applied, for pages and the API. */
export const withLiveVote = (d: Dataset) => shared.apply(d);
