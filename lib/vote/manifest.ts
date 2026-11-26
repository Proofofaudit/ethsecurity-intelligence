/**
 * Vote manifest alignment and publication (pure). The official manifest lists `slugs[i]` and,
 * in the same order, `projects[i]` (registered goal, RFP flag, affiliation group indexes into
 * `groups`). Index alignment is never assumed: every sync re-checks it against the ballot
 * records, and a failed check fails closed (no remapping, group features disabled).
 */
import type { VoteSection } from "@/lib/domain/schemas";
import type { VoteManifest } from "@/lib/official/schemas";

export const MANIFEST_SOURCE_URL = "https://initiatives.thedao.fund/api/vote/manifest";

/** One micro-USD is 1e-6 USD; one cent is 10,000 micro-USD. */
const MICRO_PER_CENT = 10_000n;

/** Six-decimal USD string → integer cents. Null when it has sub-cent digits or exceeds safe integers. */
export function microUsdToCents(micro: string): number | null {
  if (!/^\d{1,78}$/.test(micro)) return null;
  const v = BigInt(micro);
  if (v % MICRO_PER_CENT !== 0n) return null;
  const cents = v / MICRO_PER_CENT;
  return cents <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(cents) : null;
}

/** Integer cents → micro-USD BigInt (exact). */
export const centsToMicroUsd = (cents: number): bigint => BigInt(cents) * MICRO_PER_CENT;

export interface BallotRecord {
  slug: string;
  goalCents: number;
  type: "grant" | "rfp";
}

export interface ManifestSource {
  objectHash: string | null;
  fetchedAt: string | null;
  stale: boolean;
  /** Why no manifest is available (fetch or validation error). */
  error: string | null;
}

type Check = VoteSection["alignment"]["checks"][number];

/**
 * Alignment checks between manifest arrays and the ballot cohort.
 * `cohort`: slug → initiative id for the research cohort; `ballot`: the ballot records by slug.
 */
export function checkAlignment(m: VoteManifest, cohort: Map<string, string>, ballot: Map<string, BallotRecord>): { ok: boolean; checks: Check[] } {
  const checks: Check[] = [];
  const add = (check: string, ok: boolean, detail: string) => checks.push({ check, ok, detail });
  add("round_kind", m.kind === "real", `kind=${m.kind}`);
  add("projects_length", m.slugs.length === m.projects.length, `slugs ${m.slugs.length}, projects ${m.projects.length}`);
  const unique = new Set(m.slugs);
  add("unique_slugs", unique.size === m.slugs.length, `${unique.size} unique of ${m.slugs.length}`);
  const notInCohort = m.slugs.filter((s) => !cohort.has(s));
  const missing = [...cohort.keys()].filter((s) => !unique.has(s));
  add(
    "same_cohort",
    notInCohort.length === 0 && missing.length === 0 && m.slugs.length === cohort.size,
    `manifest ${m.slugs.length}, cohort ${cohort.size}; not in cohort: ${notInCohort.length}${notInCohort.length ? ` (${notInCohort.slice(0, 3).join(", ")})` : ""}; cohort not in manifest: ${missing.length}${missing.length ? ` (${missing.slice(0, 3).join(", ")})` : ""}`,
  );
  const goalMismatch: string[] = [];
  const rfpMismatch: string[] = [];
  let compared = 0;
  m.slugs.forEach((slug, i) => {
    const p = m.projects[i];
    const b = ballot.get(slug);
    if (!p || !b) {
      goalMismatch.push(`${i}:${slug}`);
      return;
    }
    compared++;
    if (BigInt(p.goalUsd) !== BigInt(b.goalCents) * MICRO_PER_CENT) goalMismatch.push(`${i}:${slug}`);
    if (p.rfp !== (b.type === "rfp")) rfpMismatch.push(`${i}:${slug}`);
  });
  add(
    "goal_by_index",
    goalMismatch.length === 0 && compared === m.slugs.length,
    goalMismatch.length ? `${goalMismatch.length} index(es) where projects[i].goalUsd ≠ ballot goal of slugs[i]: ${goalMismatch.slice(0, 5).join(", ")}` : `projects[i].goalUsd equals the ballot goal of slugs[i] for all ${compared}`,
  );
  add(
    "rfp_by_index",
    rfpMismatch.length === 0 && compared === m.slugs.length,
    rfpMismatch.length ? `${rfpMismatch.length} index(es) where projects[i].rfp ≠ ballot type of slugs[i]: ${rfpMismatch.slice(0, 5).join(", ")}` : `projects[i].rfp matches the ballot type of slugs[i] for all ${compared}`,
  );
  const badGroup = m.projects.findIndex((p) => p.groups.some((g) => g < 0 || g >= m.groups.length));
  add("group_indexes", badGroup === -1, badGroup === -1 ? `every group index is within the ${m.groups.length} groups` : `projects[${badGroup}] names an unknown group`);
  const rfpWithGroups = m.projects.filter((p) => p.rfp && p.groups.length > 0).length;
  add("rfp_unaffiliated", rfpWithGroups === 0, `${rfpWithGroups} RFP(s) with affiliation groups`);
  if (m.accounts) add("accounts_length", m.accounts.length === m.slugs.length, `accounts ${m.accounts.length}, slugs ${m.slugs.length}`);
  return { ok: checks.every((c) => c.ok), checks };
}

/** Three ordered tally times inside the round's open and close times. */
export function scheduleOk(m: VoteManifest): boolean {
  const t = m.schedule.firstTallyAt;
  return t.length === 3 && t.every((x, i) => i === 0 || x >= (t[i - 1] as number)) && (t[0] as number) >= m.schedule.opensAt && m.closesAt >= (t[2] as number);
}

export function unavailableVote(reason: string, source: Partial<ManifestSource> = {}): VoteSection {
  return {
    status: "unavailable",
    statusReason: reason,
    groupsAvailable: false,
    scheduleAvailable: false,
    sourceUrl: MANIFEST_SOURCE_URL,
    fetchedAt: source.fetchedAt ?? null,
    stale: false,
    objectHash: null,
    kind: null,
    chainId: null,
    contract: null,
    configRevision: null,
    readAt: null,
    opensAt: null,
    closesAt: null,
    schedule: null,
    poolMicroUsd: null,
    poolCents: null,
    ballotRules: null,
    independentTiers: null,
    slugs: [],
    projects: [],
    groups: [],
    initiativeGroups: {},
    alignment: { ok: false, checks: [{ check: "manifest_present", ok: false, detail: reason }] },
  };
}

/** Build the published vote section. Never remaps: groups attach to initiatives only when aligned. */
export function buildVoteSection(m: VoteManifest | null, source: ManifestSource, cohort: Map<string, string>, ballot: Map<string, BallotRecord>): VoteSection {
  if (!m) return unavailableVote(source.error ?? "The vote manifest was not retrieved.", source);
  const alignment = checkAlignment(m, cohort, ballot);
  const aligned = alignment.ok;
  const initiativeGroups: Record<string, string[]> = {};
  if (aligned)
    m.slugs.forEach((slug, i) => {
      const id = cohort.get(slug) as string;
      initiativeGroups[id] = (m.projects[i]?.groups ?? []).map((g) => m.groups[g] as string);
    });
  const schedOk = scheduleOk(m);
  const failed = alignment.checks.filter((c) => !c.ok).map((c) => c.check);
  return {
    status: aligned ? "aligned" : "unaligned",
    statusReason: aligned
      ? `slugs and projects align by index for all ${m.slugs.length} initiatives${source.stale ? " (stored manifest reused: the latest fetch failed)" : ""}`
      : `Alignment check failed (${failed.join(", ")}). Affiliation groups are disabled until the manifest is confirmed; nothing was remapped.`,
    groupsAvailable: aligned,
    scheduleAvailable: schedOk,
    sourceUrl: MANIFEST_SOURCE_URL,
    fetchedAt: source.fetchedAt,
    stale: source.stale,
    objectHash: source.objectHash,
    kind: m.kind,
    chainId: m.chainId,
    contract: m.contract,
    configRevision: m.configRevision ?? null,
    readAt: m.readAt ? { block: m.readAt.block, timestamp: m.readAt.timestamp } : null,
    opensAt: m.opensAt,
    closesAt: m.closesAt,
    schedule: { opensAt: m.schedule.opensAt, firstTallyAt: [...m.schedule.firstTallyAt], initialWindow: m.schedule.initialWindow, maxWindows: m.schedule.maxWindows },
    poolMicroUsd: m.poolUsd,
    poolCents: microUsdToCents(m.poolUsd),
    ballotRules: m.ballotRules ?? null,
    independentTiers: m.independentTiers,
    slugs: [...m.slugs],
    projects: m.projects.map((p) => ({ goalMicroUsd: p.goalUsd, rfp: p.rfp, groups: [...p.groups] })),
    groups: [...m.groups],
    initiativeGroups,
    alignment,
  };
}

/** Plain-language state for status views and API consumers. */
export function voteFeatureState(v: VoteSection) {
  return {
    status: v.status,
    groupsAvailable: v.groupsAvailable,
    scheduleAvailable: v.scheduleAvailable,
    poolAvailable: v.poolCents !== null,
    disabled: [
      ...(v.groupsAvailable ? [] : ["Affiliation groups"]),
      ...(v.groupsAvailable && v.poolCents !== null ? [] : ["Ballot Prep checks"]),
      ...(v.scheduleAvailable ? [] : ["Tally countdown from the official schedule"]),
    ],
  };
}
