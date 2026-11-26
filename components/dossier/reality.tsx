import type { Dossier } from "@/lib/intelligence/service";
import { Money, Pct, formatDate } from "@/components/ui/money";
import { ExternalLink } from "@/components/ui/button";
import { Mark } from "@/components/ui/status";
import { ClaimList } from "./inspector";

/**
 * Reality vs. Promises. Left: what exists today with machine-observed proof, then what the
 * applicant says exists without independent support. Right: what the funding would build,
 * adoption-dependent work and unconfirmed dependencies. Built only from claims, products and
 * official milestones; no rewriting of proposal text.
 */
export function RealityVsPromises({ x }: { x: Dossier }) {
  const r = x.reality;
  const goal = x.initiative.funding.goalCents;
  const pages = r.products.filter((p) => p.reachable);
  return (
    <section aria-labelledby="rvp-h" className="border-y border-ink">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule py-2.5">
        <h2 id="rvp-h" className="text-md font-semibold">
          Reality vs. Promises
        </h2>
        <p className="text-xs text-ink-3">Built from evidence records and the official milestone list, not from a rewrite of the proposal.</p>
      </div>
      <div className="grid md:grid-cols-2 md:divide-x md:divide-rule">
        <div className="py-4 md:pr-6">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Mark glyph="full" className="text-st-verified" /> Exists today (with proof)
          </h3>
          <div className="mt-3 space-y-4">
            <ClaimList ids={r.existing.map((c) => c.id)} empty="No existing work with independent evidence was found by the research pipeline." />
            {pages.length > 0 && (
              <div>
                <p className="eyebrow mb-1">Reachable pages</p>
                <ul className="space-y-1 text-sm">
                  {pages.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-baseline gap-x-2">
                      <ExternalLink href={p.url}>{p.title ?? p.name}</ExternalLink>
                      <span className="num text-2xs text-ink-3">{p.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}</span>
                      <span className="text-2xs text-ink-3">
                        HTTP {p.status ?? "?"}, checked {formatDate(p.checkedAt)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-2xs text-ink-3">A reachable page shows that something is online, not what it does.</p>
              </div>
            )}
            {r.statedExisting.length > 0 && (
              <div>
                <p className="eyebrow mb-1.5">Stated by the applicant, not independently verified</p>
                <ClaimList ids={r.statedExisting.map((c) => c.id)} empty="" />
              </div>
            )}
          </div>
        </div>
        <div className="border-t border-rule py-4 md:border-t-0 md:pl-6">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Mark glyph="dashed" className="text-st-future" /> Funding would build
          </h3>
          <p className="mt-1 text-xs text-ink-2">
            <Money cents={r.fundingForProposedCents} /> for delivery milestones and <Money cents={r.fundingForAdoptionCents} /> for adoption milestones, of a <Money cents={goal} /> goal.
            {r.fundingForCompletedCents > 0 && (
              <>
                {" "}
                <Money cents={r.fundingForCompletedCents} /> is in milestones already marked complete.
              </>
            )}
          </p>
          <ul className="mt-3 divide-y divide-rule border-y border-rule">
            {[...r.proposed, ...r.adoption]
              .sort((a, b) => a.index - b.index)
              .map((m) => (
                <li key={m.id} className="grid grid-cols-[1fr_auto] gap-x-4 py-2 text-sm">
                  <span>
                    <span className="num mr-2 text-xs text-ink-3">M{m.index + 1}</span>
                    {m.name}
                    {m.adoption && <span className="ml-2 text-2xs text-st-partial">Paid on third-party adoption</span>}
                  </span>
                  <span className="text-right">
                    <Money cents={m.amountCents} />
                    <span className="block text-2xs text-ink-3">
                      <Pct value={m.shareOfGoal} digits={0} /> of goal
                    </span>
                  </span>
                </li>
              ))}
          </ul>
          {r.proposed.length + r.adoption.length === 0 && <p className="mt-2 text-sm text-ink-3">Every milestone is marked complete.</p>}
          <div className="mt-4">
            <p className="eyebrow mb-1">Unconfirmed dependencies</p>
            {r.dependencies.length ? (
              <ul className="space-y-1.5 text-sm">
                {r.dependencies.map((dep, i) => (
                  <li key={`${dep.kind}-${i}`} className="grid grid-cols-[88px_1fr] gap-3 max-sm:grid-cols-1 max-sm:gap-0">
                    <span className="text-2xs text-ink-3 uppercase">{dep.kind === "standard" ? "Standard" : dep.kind === "integration" ? "Integration" : "Adoption"}</span>
                    <span>
                      <span className="text-ink">{dep.label}</span>
                      <span className="block text-xs text-ink-3">{dep.reason}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-3">No standards, planned integrations or adoption milestones were identified.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
