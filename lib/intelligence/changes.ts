/**
 * Change detection for the Research Time Machine.
 *  - snapshotChanges: structured diff of two published datasets (funding, pledges, milestones, text, eligibility).
 *  - revisionChanges: what each official proposal revision changed relative to the previous one.
 */
import type { ChangeRecord, Claim, Initiative, Milestone, Pledge, Revision } from "@/lib/domain/schemas";
import { stableId } from "@/lib/util/hash";
import { formatUsd } from "@/lib/util/money";

export interface Comparable {
  snapshotId: string;
  initiatives: Initiative[];
  milestones: Milestone[];
  pledges: Pledge[];
  claims: Claim[];
}

export function snapshotChanges(prev: Comparable, next: Comparable, detectedAt: string): ChangeRecord[] {
  const out: ChangeRecord[] = [];
  const push = (initiativeId: string | null, kind: ChangeRecord["kind"], summary: string, before?: unknown, after?: unknown) =>
    out.push({
      id: stableId("chg", next.snapshotId, initiativeId ?? "-", kind, summary),
      initiativeId,
      detectedAt,
      kind,
      summary,
      before,
      after,
      source: "snapshot_diff",
      fromSnapshot: prev.snapshotId,
      toSnapshot: next.snapshotId,
    });
  const prevById = new Map(prev.initiatives.map((i) => [i.id, i]));
  for (const n of next.initiatives) {
    const p = prevById.get(n.id);
    if (!p) continue;
    if (p.onBallot !== n.onBallot) push(n.id, "eligibility_changed", `Ballot eligibility changed: ${p.onBallot ? "on" : "off"} → ${n.onBallot ? "on" : "off"} ballot`, p.onBallot, n.onBallot);
    if (p.funding.goalCents !== n.funding.goalCents)
      push(n.id, "goal_changed", `Funding goal changed ${formatUsd(p.funding.goalCents)} → ${formatUsd(n.funding.goalCents)}`, p.funding.goalCents, n.funding.goalCents);
    if (p.funding.officialRaisedCents !== n.funding.officialRaisedCents)
      push(
        n.id,
        "funding_changed",
        `Official raised ${formatUsd(p.funding.officialRaisedCents, { precise: true })} → ${formatUsd(n.funding.officialRaisedCents, { precise: true })}`,
        p.funding,
        n.funding,
      );
    if (p.contentHash !== n.contentHash) push(n.id, "text_changed", `Proposal content changed (revision ${p.revision ?? "?"} → ${n.revision ?? "?"})`, p.revision, n.revision);
    if ((n.revision ?? 0) > (p.revision ?? 0)) push(n.id, "revision_added", `New official revision ${n.revision}`, p.revision, n.revision);

    const pm = prev.milestones.filter((m) => m.initiativeId === n.id);
    const nm = next.milestones.filter((m) => m.initiativeId === n.id);
    const sig = (ms: Milestone[]) => ms.map((m) => `${m.name}|${m.amountCents}|${m.adoption}|${m.criteria.join("/")}`).join("\n");
    if (sig(pm) !== sig(nm)) push(n.id, "milestones_changed", `Milestones changed (${pm.length} → ${nm.length})`, pm.map((m) => m.name), nm.map((m) => m.name));
    for (const m of nm) {
      const old = pm.find((x) => x.index === m.index && x.name === m.name);
      if (old && !old.done && m.done) push(n.id, "milestone_completed", `Milestone "${m.name}" marked complete`);
    }
  }
  const prevPledges = new Map(prev.pledges.map((p) => [p.id, p]));
  const nextPledges = new Map(next.pledges.map((p) => [p.id, p]));
  for (const p of next.pledges) {
    const o = prevPledges.get(p.id);
    if (!o) push(p.initiativeId, "pledge_added", `New pledge: ${p.company} ${formatUsd(p.amountCents)} (${p.status})`, null, p);
    else {
      if (o.status !== p.status) push(p.initiativeId, "pledge_status_changed", `Pledge from ${p.company} ${o.status} → ${p.status}`, o.status, p.status);
      if (o.amountCents !== p.amountCents) push(p.initiativeId, "pledge_amount_changed", `Pledge from ${p.company} ${formatUsd(o.amountCents)} → ${formatUsd(p.amountCents)}`, o.amountCents, p.amountCents);
    }
  }
  for (const o of prev.pledges) if (!nextPledges.has(o.id)) push(o.initiativeId, "pledge_removed", `Pledge removed: ${o.company} ${formatUsd(o.amountCents)}`, o, null);
  const prevClaims = new Map(prev.claims.map((c) => [c.id, c]));
  for (const c of next.claims) {
    const o = prevClaims.get(c.id);
    if (o && o.status !== c.status) push(c.initiativeId, "claim_status_changed", `Claim status ${o.status} → ${c.status}: ${c.assertion.slice(0, 120)}`, o.status, c.status);
  }
  return out;
}

function sectionDiffKeys(a: Record<string, string> | null, b: Record<string, string> | null): string[] {
  if (!a || !b) return [];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].filter((k) => (a[k] ?? "").trim() !== (b[k] ?? "").trim());
}

export function revisionChanges(revisions: Revision[]): ChangeRecord[] {
  const out: ChangeRecord[] = [];
  const byIni = new Map<string, Revision[]>();
  for (const r of revisions) byIni.set(r.initiativeId, [...(byIni.get(r.initiativeId) ?? []), r]);
  for (const [initiativeId, revs] of byIni) {
    const sorted = revs.filter((r) => r.fetched).sort((a, b) => a.n - b.n);
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1] as Revision;
      const b = sorted[i] as Revision;
      const parts: string[] = [];
      if (a.title !== b.title) parts.push("title");
      if (a.summary !== b.summary) parts.push("summary");
      const secs = sectionDiffKeys(a.sections, b.sections);
      if (secs.length) parts.push(`sections (${secs.join(", ")})`);
      const ms = (r: Revision) => (r.milestones ?? []).map((m) => `${m.name}|${m.amountCents}|${m.adoption}|${m.done}|${m.criteria.join("/")}`).join("\n");
      if (ms(a) !== ms(b)) {
        const ta = (a.milestones ?? []).reduce((s, m) => s + m.amountCents, 0);
        const tb = (b.milestones ?? []).reduce((s, m) => s + m.amountCents, 0);
        parts.push(`milestones (${a.milestones?.length ?? 0} → ${b.milestones?.length ?? 0}${ta !== tb ? `, ${formatUsd(ta)} → ${formatUsd(tb)}` : ""})`);
      }
      out.push({
        id: stableId("chg", "rev", initiativeId, String(b.n)),
        initiativeId,
        detectedAt: b.createdAt,
        kind: "revision_added",
        summary: parts.length ? `Revision ${b.n} changed ${parts.join("; ")}` : `Revision ${b.n} (no text differences in public fields)`,
        before: { n: a.n },
        after: { n: b.n, changed: parts },
        source: "official_revision",
        fromSnapshot: null,
        toSnapshot: null,
      });
    }
  }
  return out.sort((x, y) => y.detectedAt.localeCompare(x.detectedAt));
}
