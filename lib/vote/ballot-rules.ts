/**
 * Ballot Prep rule checks (pure, browser-safe). An unofficial pre-check of the three ballot rules
 * in TheDAO's 17 Nov 2026 voting post, computed the way the official vote app computes them
 * (initiatives.thedao.fund/vote, open source at github.com/BlossomLabs/thedao-initiatives):
 *
 *  1. Size: the TheDAO asks of every initiative on the ballot (S + A + B) sum to at least
 *     ceil(1.5 × poolUsd). The official app caps the threshold at the sum of all asks in the round,
 *     so a ballot holding every initiative always passes.
 *  2. Independence: S-tier holds at least 3 initiatives that are pairwise unaffiliated, meaning no
 *     two of the three share an affiliation group. Initiatives with no groups (every RFP) are
 *     unaffiliated with everything.
 *  3. Group share: for every affiliation group present in S-tier, 2 × (sum of goals of the S-tier
 *     initiatives in that group) ≤ (sum of goals of all S-tier initiatives). Exactly 50% passes.
 *
 * Plus the official app's tier-order check: a tier cannot be empty while a later tier has picks.
 * All money is integer micro-USD (BigInt), the unit of the manifest, so boundaries are exact.
 * Rules 2 and 3 apply to the tiers named by the manifest's `independentTiers` bitmask (bit 0 = S,
 * bit 1 = A); the current round sets 1, so S-tier only.
 */

export const TIERS = ["S", "A", "B"] as const;
export type Tier = (typeof TIERS)[number];
/** Initiative id → tier. Initiatives not in the map are Off the ballot. */
export type Draft = Record<string, Tier>;

export interface BallotProject {
  id: string;
  /** Registered funding goal in micro-USD (manifest projects[i].goalUsd). */
  goalMicro: bigint;
  /** TheDAO ask in micro-USD; null when unavailable. */
  askMicro: bigint | null;
  /** Affiliation group names; empty means unaffiliated. */
  groups: readonly string[];
}

export interface BallotInput {
  projects: readonly BallotProject[];
  poolMicro: bigint;
  /** Manifest independentTiers bitmask. Default 1 (S-tier only). */
  independentTiers?: number;
}

export interface SizeCheck {
  rule: "size";
  /** Null when an ask is unavailable, so the sum cannot be computed. */
  ok: boolean | null;
  requestedMicro: bigint | null;
  /** ceil(1.5 × pool). */
  thresholdMicro: bigint;
  /** min(threshold, sum of all asks in the round): the amount the ballot has to reach. */
  neededMicro: bigint | null;
  capped: boolean;
  shortMicro: bigint;
}

export interface IndependentCheck {
  rule: "independent";
  tier: Tier;
  ok: boolean;
  tierCount: number;
  /** Size of the largest pairwise-unaffiliated set found, counted up to 3. */
  found: number;
  /** Three pairwise-unaffiliated initiative ids when the rule passes. */
  proof: string[];
  /** Groups with two or more initiatives in the tier. */
  related: { group: string; ids: string[] }[];
}

export interface GroupShare {
  group: string;
  ids: string[];
  goalMicro: bigint;
  ok: boolean;
}

export interface GroupCheck {
  rule: "group";
  tier: Tier;
  ok: boolean;
  tierGoalMicro: bigint;
  groups: GroupShare[];
}

export interface OrderCheck {
  rule: "order";
  ok: boolean;
  /** Tiers left empty while a later tier has picks. */
  empty: Tier[];
}

export interface BallotChecks {
  order: OrderCheck;
  size: SizeCheck;
  independent: IndependentCheck[];
  group: GroupCheck[];
  ok: boolean;
  /** Initiatives placed in each tier, in the order of `projects`. */
  tiers: Record<Tier, string[]>;
}

/** ceil(3 × pool / 2), as the official app computes it: (3 × pool + 1) / 2 in integer math. */
export const sizeThreshold = (poolMicro: bigint): bigint => (3n * poolMicro + 1n) / 2n;

const sum = (xs: bigint[]) => xs.reduce((a, b) => a + b, 0n);

function independentTiers(mask: number): Tier[] {
  return ([0, 1] as const).filter((b) => (mask >> b) & 1).map((b) => TIERS[b]);
}

function affiliated(a: BallotProject, b: BallotProject): boolean {
  return a.groups.some((g) => b.groups.includes(g));
}

/** Finds three pairwise-unaffiliated projects (the official app's search, same order). */
function findIndependent(list: BallotProject[]): { found: number; proof: string[] } {
  const n = list.length;
  let found = Math.min(n, 1);
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      if (affiliated(list[i]!, list[j]!)) continue;
      found = Math.max(found, 2);
      for (let k = j + 1; k < n; k++) if (!affiliated(list[i]!, list[k]!) && !affiliated(list[j]!, list[k]!)) return { found: 3, proof: [list[i]!.id, list[j]!.id, list[k]!.id] };
    }
  return { found, proof: [] };
}

export function checkBallot(input: BallotInput, draft: Draft): BallotChecks {
  const tiers: Record<Tier, string[]> = { S: [], A: [], B: [] };
  for (const p of input.projects) {
    const t = draft[p.id];
    if (t) tiers[t].push(p.id);
  }
  const byId = new Map(input.projects.map((p) => [p.id, p]));
  const pick = (ids: string[]) => ids.map((id) => byId.get(id)!);

  const empty = TIERS.filter((t, i) => tiers[t].length === 0 && TIERS.slice(i + 1).some((later) => tiers[later].length > 0));
  const order: OrderCheck = { rule: "order", ok: empty.length === 0, empty };

  const thresholdMicro = sizeThreshold(input.poolMicro);
  const allAsks = input.projects.map((p) => p.askMicro);
  const onBallot = pick([...tiers.S, ...tiers.A, ...tiers.B]);
  const asksKnown = allAsks.every((a): a is bigint => a !== null);
  let size: SizeCheck;
  if (!asksKnown) {
    size = { rule: "size", ok: null, requestedMicro: null, thresholdMicro, neededMicro: null, capped: false, shortMicro: 0n };
  } else {
    const total = sum(allAsks as bigint[]);
    const neededMicro = thresholdMicro < total ? thresholdMicro : total;
    const requestedMicro = sum(onBallot.map((p) => p.askMicro as bigint));
    size = { rule: "size", ok: requestedMicro >= neededMicro, requestedMicro, thresholdMicro, neededMicro, capped: neededMicro < thresholdMicro, shortMicro: requestedMicro >= neededMicro ? 0n : neededMicro - requestedMicro };
  }

  const independent: IndependentCheck[] = [];
  const group: GroupCheck[] = [];
  for (const tier of independentTiers(input.independentTiers ?? 1)) {
    const list = pick(tiers[tier]);
    const members = new Map<string, string[]>();
    for (const p of list) for (const g of p.groups) members.set(g, [...(members.get(g) ?? []), p.id]);
    const names = [...members.keys()].sort((a, b) => a.localeCompare(b));
    const ind = findIndependent(list);
    independent.push({
      rule: "independent",
      tier,
      ok: ind.found >= 3,
      tierCount: list.length,
      found: ind.found,
      proof: ind.proof,
      related: names.filter((g) => members.get(g)!.length >= 2).map((g) => ({ group: g, ids: members.get(g)! })),
    });
    const tierGoalMicro = sum(list.map((p) => p.goalMicro));
    const shares = names.map((g) => {
      const ids = members.get(g)!;
      const goalMicro = sum(ids.map((id) => byId.get(id)!.goalMicro));
      return { group: g, ids, goalMicro, ok: 2n * goalMicro <= tierGoalMicro };
    });
    group.push({ rule: "group", tier, ok: shares.every((s) => s.ok), tierGoalMicro, groups: shares });
  }

  const ok = order.ok && size.ok === true && independent.every((c) => c.ok) && group.every((c) => c.ok);
  return { order, size, independent, group, ok, tiers };
}

/** Exact dollars from micro-USD: two decimals, more only when the value has sub-cent digits. */
export function formatMicroUsd(micro: bigint): string {
  const neg = micro < 0n;
  const v = neg ? -micro : micro;
  const whole = v / 1_000_000n;
  let frac = (v % 1_000_000n).toString().padStart(6, "0");
  frac = frac.slice(0, 2) + frac.slice(2).replace(/0+$/, "");
  return `${neg ? "-" : ""}$${whole.toLocaleString("en-US")}.${frac}`;
}

/** Share of a total as a percentage with two decimals, from exact integers. */
export function shareText(part: bigint, total: bigint): string {
  if (total === 0n) return "0.00%";
  const bp = (part * 10_000n) / total;
  return `${bp / 100n}.${(bp % 100n).toString().padStart(2, "0")}%`;
}

/** One-line, neutral fix for each failing check; null when the check passes. */
export function fixFor(check: OrderCheck | SizeCheck | IndependentCheck | GroupCheck | GroupShare): string | null {
  if ("rule" in check) {
    switch (check.rule) {
      case "order":
        return check.ok ? null : `Place at least one initiative in ${check.empty.map((t) => `${t}-tier`).join(" and ")} before using a later tier.`;
      case "size":
        return check.ok !== false || check.neededMicro === null ? null : `Add initiatives to any tier until the asks total reaches ${formatMicroUsd(check.neededMicro)} (${formatMicroUsd(check.shortMicro)} more).`;
      case "independent":
        return check.ok ? null : `Add initiatives to ${check.tier}-tier that share no affiliation group with each other until three qualify (${check.found} now).`;
      case "group":
        return null;
    }
  }
  return check.ok ? null : `Bring ${check.group} to 50% or less of the tier's goals: move one of its initiatives to another tier, or add other initiatives to this tier.`;
}
