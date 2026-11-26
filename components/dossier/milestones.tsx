import type { Claim, Milestone } from "@/lib/domain/schemas";
import { Money, Pct } from "@/components/ui/money";
import { ExternalLink } from "@/components/ui/button";
import { ClaimLine } from "./inspector";

const MONTH = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
function month(v: string | null) {
  if (!v) return null;
  const t = Date.parse(/^\d{4}-\d{2}$/.test(v) ? `${v}-01T00:00:00Z` : v);
  return Number.isFinite(t) ? MONTH.format(t) : v;
}

/** Milestone X-Ray: every official milestone with budget, criteria, dependencies, evidence and questions. */
export function MilestoneXRay({ milestones, claims, goalCents }: { milestones: Milestone[]; claims: Claim[]; goalCents: number }) {
  if (!milestones.length) return <p className="text-sm text-ink-3">The official record lists no milestones.</p>;
  const total = milestones.reduce((s, m) => s + m.amountCents, 0);
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-2">
        <span>
          <span className="num">{milestones.length}</span> milestones totaling <Money cents={total} />
          {total !== goalCents && (
            <>
              {" "}
              (goal <Money cents={goalCents} />)
            </>
          )}
        </span>
        <span>
          <span className="num">{milestones.filter((m) => m.adoption).length}</span> adoption · <span className="num">{milestones.filter((m) => m.done).length}</span> complete
        </span>
      </div>
      <ol className="border-t border-ink">
        {milestones.map((m) => {
          const ev = claims.filter((c) => c.section === `milestone:${m.index}`);
          const target = month(m.targetMonth);
          return (
            <li key={m.id} className="grid gap-x-6 gap-y-3 border-b border-rule py-4 md:grid-cols-[minmax(0,1fr)_220px]">
              <div className="min-w-0">
                <div className="flex items-baseline gap-3">
                  <span className="num text-xs text-ink-3">M{m.index + 1}</span>
                  <h3 className="text-base font-semibold">{m.name}</h3>
                </div>
                <div className="mt-2 pl-8 max-sm:pl-0">
                  <p className="eyebrow mb-1">Acceptance criteria</p>
                  {m.criteria.length ? (
                    <ul className="list-[square] space-y-1 pl-4 text-sm text-ink-2 marker:text-ink-3">
                      {m.criteria.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-ink-3">No acceptance criteria recorded.</p>
                  )}
                  {m.dependencyTerms.length > 0 && (
                    <p className="mt-2 text-xs text-ink-2">
                      <span className="text-ink-3">External dependency wording: </span>
                      {m.dependencyTerms.map((t) => `“${t}”`).join(", ")}
                    </p>
                  )}
                  {ev.length > 0 && (
                    <div className="mt-3">
                      <p className="eyebrow mb-1">Evidence</p>
                      <ul className="space-y-2">
                        {ev.map((c) => (
                          <li key={c.id}>
                            <ClaimLine id={c.id} text={c.kind === "milestone_deliverable" || c.kind === "adoption_commitment" ? "Planned in the official milestone record. Not yet delivered, so it cannot be verified as existing." : undefined} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {m.questions.length > 0 && (
                    <div className="mt-3">
                      <p className="eyebrow mb-1">Questions for reviewers</p>
                      <ul className="space-y-1 text-sm text-ink-2">
                        {m.questions.map((q) => (
                          <li key={q.code} className="flex gap-2">
                            <span aria-hidden="true" className="text-ink-3">
                              ?
                            </span>
                            {q.question}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
              <dl className="grid h-fit grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs md:border-l md:border-rule md:pl-4">
                <dt className="text-ink-3">Budget</dt>
                <dd className="text-right">
                  <Money cents={m.amountCents} className="text-sm text-ink" />
                </dd>
                <dt className="text-ink-3">Share of goal</dt>
                <dd className="text-right">
                  <Pct value={m.shareOfGoal} />
                </dd>
                <dt className="text-ink-3">Type</dt>
                <dd className="text-right">{m.adoption ? "Adoption (third-party uptake)" : "Delivery"}</dd>
                <dt className="text-ink-3">Status</dt>
                <dd className="text-right">{m.done ? "Marked complete" : "Not complete"}</dd>
                <dt className="text-ink-3">Target</dt>
                <dd className="text-right">{target ?? <span className="text-ink-3">Not recorded</span>}</dd>
                {m.link && (
                  <>
                    <dt className="text-ink-3">Link</dt>
                    <dd className="truncate text-right">
                      <ExternalLink href={m.link}>Artifact</ExternalLink>
                    </dd>
                  </>
                )}
              </dl>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-2xs text-ink-3">Questions are raised by deterministic rules over the official milestone record. They are prompts for reviewers, not failures.</p>
    </div>
  );
}
