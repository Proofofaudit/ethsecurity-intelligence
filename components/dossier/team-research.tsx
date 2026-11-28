import { DeliveryBadge, EvidenceBadge, NOT_YET_RESEARCHED } from "@/components/ui/badges";
import { ExternalLink } from "@/components/ui/button";
import { ChartFrame } from "@/components/ui/chart-frame";
import { Sparkline, sparklineAlt } from "@/components/ui/charts";
import { formatDate } from "@/components/ui/money";
import { CLAIM_TO_BADGE, DELIVERY_TO_BADGE } from "@/lib/search/badge-kinds";
import type { SourceLink, TeamMember, TeamResearchResult } from "@/lib/team/types";

export const NOT_FOUND_TEXT = "Not found in public sources";

const SPARK_HELP = "Public commits per month by this person over the last 12 months, from public GitHub activity. A shape of activity, not a measure of quality. It is not ranked or scored.";

function Sources({ sources }: { sources: SourceLink[] }) {
  if (sources.length === 0) return <span className="text-xs text-ink-3">{NOT_FOUND_TEXT}</span>;
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
      {sources.map((s) => (
        <ExternalLink key={s.url} href={s.url}>
          {s.label}
        </ExternalLink>
      ))}
    </span>
  );
}

function MemberCard({ m }: { m: TeamMember }) {
  return (
    <li className="min-w-0 border border-rule p-3" data-team-member>
      <p className="text-sm font-semibold">{m.name}</p>
      <p className="text-xs text-ink-3">{m.role || NOT_FOUND_TEXT}</p>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {m.handles.length === 0 ? (
          <span className="text-ink-3">Public handles: {NOT_FOUND_TEXT}</span>
        ) : (
          m.handles.map((h) => (
            <ExternalLink key={h.url} href={h.url}>
              {h.platform} {h.handle}
            </ExternalLink>
          ))
        )}
      </div>
      <div className="mt-3">
        <p className="eyebrow mb-1">Already shipped</p>
        {m.pastWork.length === 0 ? (
          <p className="text-xs text-ink-3">{NOT_FOUND_TEXT}</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {m.pastWork.map((w) => (
              <li key={w.url} className="rounded-xs border border-rule-2 px-1.5 py-0.5 text-xs">
                <ExternalLink href={w.url}>{w.label}</ExternalLink>
              </li>
            ))}
          </ul>
        )}
      </div>
      <ChartFrame className="mt-3" title="GitHub activity, 12 months" help={SPARK_HELP} alt={sparklineAlt(m.githubMonthlyCommits)}>
        <Sparkline values={m.githubMonthlyCommits} />
      </ChartFrame>
      <p className="mt-2 text-2xs text-ink-3">Checked {formatDate(m.checkedOn)}</p>
    </li>
  );
}

/**
 * The research TheDAO's site does not show: team, organization, delivery history and claim checks.
 * Rendered from the published team research contract. Missing parts say so; no ranking.
 */
export function TeamResearchSection({ research }: { research: TeamResearchResult }) {
  return (
    <section aria-labelledby="team-research-h" className="mt-10 border-t border-ink pt-3" data-team-research>
      <h2 id="team-research-h" className="text-lg font-semibold">
        Team and delivery research
      </h2>
      <p className="mt-0.5 text-xs text-ink-3">Public sources only, each with the date it was checked. Not found means not found in public sources, not a negative finding.</p>
      {!research.researched ? (
        <p className="mt-3 text-sm text-ink-2" data-state="not-researched">
          {NOT_YET_RESEARCHED}
        </p>
      ) : (
        <div className="mt-4 space-y-8">
          <div>
            <h3 className="mb-2 text-sm font-semibold">Team</h3>
            {research.data.members.length === 0 ? (
              <p className="text-sm text-ink-2">{NOT_FOUND_TEXT}</p>
            ) : (
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {research.data.members.map((m) => (
                  <MemberCard key={m.name} m={m} />
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">Organization</h3>
            {research.data.organization ? (
              <div className="max-w-[860px] text-sm">
                <p className="font-medium">{research.data.organization.name}</p>
                <p className="mt-1 text-ink-2">{research.data.organization.summary}</p>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                  {research.data.organization.website && <ExternalLink href={research.data.organization.website}>Website</ExternalLink>}
                  <Sources sources={research.data.organization.sources} />
                </div>
                <p className="mt-1 text-2xs text-ink-3">Checked {formatDate(research.data.organization.checkedOn)}</p>
              </div>
            ) : (
              <p className="text-sm text-ink-2">{NOT_FOUND_TEXT}</p>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">Delivery timeline</h3>
            {research.data.deliveryTimeline.length === 0 ? (
              <p className="text-sm text-ink-2">{NOT_FOUND_TEXT}</p>
            ) : (
              <ol className="max-w-[860px] divide-y divide-rule border-y border-rule" data-delivery-timeline>
                {research.data.deliveryTimeline.map((e, n) => (
                  <li key={`${e.grant}-${n}`} className="grid gap-x-4 gap-y-1 py-2.5 text-sm sm:grid-cols-[minmax(0,1fr)_auto]">
                    <div className="min-w-0">
                      <p className="font-medium">{e.grant}</p>
                      <p className="text-xs text-ink-3">Funder: {e.funder}</p>
                      <p className="mt-1 text-xs text-ink-2">Promised: {e.promised}</p>
                      <div className="mt-1">
                        <Sources sources={e.sources} />
                      </div>
                    </div>
                    <div className="sm:text-right">
                      <DeliveryBadge kind={DELIVERY_TO_BADGE[e.status]} />
                      <p className="mt-1 text-2xs text-ink-3">Checked {formatDate(e.checkedOn)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">Claim checks</h3>
            {research.data.claimChecks.length === 0 ? (
              <p className="text-sm text-ink-2">{NOT_FOUND_TEXT}</p>
            ) : (
              <ul className="max-w-[860px] divide-y divide-rule border-y border-rule" data-claim-checks>
                {research.data.claimChecks.map((c, n) => (
                  <li key={`${c.claim}-${n}`} className="grid gap-x-4 gap-y-1 py-2.5 text-sm sm:grid-cols-[minmax(0,1fr)_auto]">
                    <div className="min-w-0">
                      <p>{c.claim}</p>
                      <div className="mt-1">
                        <Sources sources={c.sources} />
                      </div>
                    </div>
                    <div className="sm:text-right">
                      <EvidenceBadge kind={CLAIM_TO_BADGE[c.status]} />
                      <p className="mt-1 text-2xs text-ink-3">Checked {formatDate(c.checkedOn)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
