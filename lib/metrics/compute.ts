/** Deterministic metric computation. See registry.ts for definitions. */
import type { Dataset, Initiative } from "@/lib/domain/schemas";
import { sumCents } from "@/lib/util/money";
import { METRIC_BY_ID } from "./registry";

export interface MetricValue {
  id: string;
  value: number | null;
  unavailableReason: string | null;
}

const v = (id: string, value: number | null, reason: string | null = null): MetricValue => {
  if (!METRIC_BY_ID.has(id)) throw new Error(`Unregistered metric ${id}`);
  return { id, value, unavailableReason: value === null ? (reason ?? "Unavailable") : null };
};

type Slice = Pick<Dataset, "initiatives" | "milestones" | "pledges" | "donations" | "claims" | "researchJobs" | "evidence" | "repositories">;

export function backerTotals(pledges: Dataset["pledges"]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of pledges) m.set(p.backerId || p.id, (m.get(p.backerId || p.id) ?? 0) + p.amountCents);
  return m;
}

export function cohortMetrics(d: Slice): Record<string, MetricValue> {
  const out: Record<string, MetricValue> = {};
  const add = (x: MetricValue) => (out[x.id] = x);
  const I = d.initiatives;
  add(v("cohort.initiatives", I.length));
  add(v("cohort.on_ballot", I.filter((i) => i.onBallot).length));
  add(v("cohort.goal", sumCents(I.map((i) => i.funding.goalCents))));
  add(v("cohort.raised", sumCents(I.map((i) => i.funding.officialRaisedCents))));
  add(v("cohort.pledged_outstanding", sumCents(I.map((i) => i.funding.pledgedCents))));
  add(v("cohort.received_pledges", sumCents(I.map((i) => i.funding.receivedCents))));
  add(v("cohort.donated", sumCents(I.map((i) => i.funding.donatedCents))));
  add(v("cohort.remaining", sumCents(I.map((i) => Math.max(0, i.funding.goalCents - i.funding.officialRaisedCents)))));
  const ids = new Set(I.map((i) => i.id));
  const ms = d.milestones.filter((m) => ids.has(m.initiativeId));
  add(v("cohort.milestones", ms.length));
  add(v("cohort.adoption_milestones", ms.filter((m) => m.adoption).length));
  add(v("cohort.adoption_budget", sumCents(ms.filter((m) => m.adoption).map((m) => m.amountCents))));
  add(v("cohort.completed_milestones", ms.filter((m) => m.done).length));
  const pl = d.pledges.filter((p) => ids.has(p.initiativeId));
  add(v("cohort.pledge_records", pl.length));
  const totals = [...backerTotals(pl).values()].sort((a, b) => b - a);
  const all = sumCents(totals);
  add(v("cohort.top5_backer_share", all > 0 ? sumCents(totals.slice(0, 5)) / all : null, "No pledges"));
  const tasks = ["websites", "github", "milestone_artifacts", "donations_onchain"];
  const covered = I.filter((i) => tasks.every((t) => d.researchJobs.some((j) => j.initiativeId === i.id && j.task === t && j.state === "succeeded"))).length;
  add(v("cohort.research_coverage", I.length ? covered / I.length : null, "Empty cohort"));
  const txEv = new Map(d.evidence.filter((e) => e.kind === "onchain_transaction").map((e) => [e.url.split("/").pop()?.toLowerCase(), e]));
  const dn = d.donations.filter((x) => ids.has(x.initiativeId));
  const ok = dn.filter((x) => txEv.get(x.txHash.toLowerCase())?.ok).length;
  add(v("cohort.donations_verified", dn.length ? ok / dn.length : null, "No donations"));
  return out;
}

export function initiativeMetrics(d: Slice, ini: Initiative): Record<string, MetricValue> {
  const out: Record<string, MetricValue> = {};
  const add = (x: MetricValue) => (out[x.id] = x);
  const f = ini.funding;
  add(v("initiative.goal", f.goalCents));
  add(v("initiative.raised", f.officialRaisedCents));
  add(v("initiative.pct_funded", f.goalCents > 0 ? f.officialRaisedCents / f.goalCents : null, "Goal is zero"));
  add(v("initiative.remaining", Math.max(0, f.goalCents - f.officialRaisedCents)));
  add(v("initiative.donated_share", f.officialRaisedCents > 0 ? f.donatedCents / f.officialRaisedCents : null, "Nothing raised yet"));
  const pl = d.pledges.filter((p) => p.initiativeId === ini.id);
  const totals = backerTotals(pl);
  add(v("initiative.backers", totals.size));
  const sum = sumCents([...totals.values()]);
  add(v("initiative.top_backer_share", sum > 0 ? Math.max(...totals.values()) / sum : null, "No pledges"));
  add(v("initiative.backer_hhi", sum > 0 ? [...totals.values()].reduce((s, x) => s + (x / sum) ** 2, 0) : null, "No pledges"));
  add(
    v(
      "initiative.self_pledged",
      ini.organizationId ? sumCents(pl.filter((p) => p.backerId === ini.organizationId).map((p) => p.amountCents)) : null,
      "Recipient is not a resolved organisation",
    ),
  );
  const ms = d.milestones.filter((m) => m.initiativeId === ini.id);
  add(v("initiative.milestones", ms.length));
  add(v("initiative.largest_milestone_share", f.goalCents > 0 && ms.length ? Math.max(...ms.map((m) => m.amountCents)) / f.goalCents : null, "Goal is zero"));
  add(v("initiative.adoption_share", f.goalCents > 0 ? sumCents(ms.filter((m) => m.adoption).map((m) => m.amountCents)) / f.goalCents : null, "Goal is zero"));
  add(v("initiative.open_questions", ms.reduce((s, m) => s + m.questions.length, 0)));
  const cl = d.claims.filter((c) => c.initiativeId === ini.id && c.material && !["future_target", "officially_reported", "not_applicable"].includes(c.status));
  const supported = cl.filter((c) => c.status === "independently_verified" || c.status === "partially_supported").length;
  add(v("initiative.evidence_coverage", cl.length ? supported / cl.length : null, "No verifiable present-tense claims"));
  const repos = d.repositories.filter((r) => r.initiativeIds.includes(ini.id));
  add(v("initiative.repos_public", repos.filter((r) => r.exists).length));
  add(v("initiative.repos_active_90d", repos.filter((r) => (r.commitsLast90d ?? 0) > 0).length));
  add(v("initiative.repos_with_ci", repos.filter((r) => r.hasCiWorkflows).length));
  return out;
}
