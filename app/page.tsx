import Link from "next/link";
import { ArrowRight } from "@/components/ui/icons";
import { FundingBar, FundingLegend, HBarList } from "@/components/ui/charts";
import { Block, Note, PageHead, Stat } from "@/components/ui/layout";
import { DateTime, formatDate, Money, Num, Pct } from "@/components/ui/money";
import { Tag } from "@/components/ui/button";
import { ADVANCED_VIEWS } from "@/components/shell/nav";
import { loadIntelligence } from "@/lib/intelligence/load";
import { categoryDistribution, changes, coverage, filterInitiatives, fundingRelationships } from "@/lib/intelligence/service";
import { ingestionStatus } from "@/lib/intelligence/status";
import { cohortMetrics } from "@/lib/metrics/compute";
import { METRICS } from "@/lib/metrics/registry";
import { THEDAO_ASK_CAP_CENTS } from "@/lib/metrics/ask";
import { formatPct, formatUsd } from "@/lib/util/money";
import { SinceLastVisit } from "@/components/workspace/since-visit";
import { VoteCalendar } from "@/components/workspace/vote-calendar";
import { calendarView, fundingView } from "@/lib/vote/view-data";

export const revalidate = 600;

const MONTH = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

function metricText(unit: string, v: number | null) {
  if (v === null) return "Unavailable";
  if (unit === "usd_cents") return formatUsd(v);
  if (unit === "ratio") return formatPct(v);
  if (unit === "index") return v.toFixed(3);
  return v.toLocaleString("en-US");
}

export default async function OverviewPage() {
  const { dataset: d, health } = await loadIntelligence();
  const m = cohortMetrics(d);
  const val = (id: string) => m[id]?.value ?? null;
  const status = ingestionStatus(d, health);
  const grants = d.initiatives.filter((i) => i.type === "grant").length;
  const rfps = d.initiatives.length - grants;
  const goal = val("cohort.goal") ?? 0;
  const pledged = val("cohort.pledged_outstanding") ?? 0;
  const donated = val("cohort.donated") ?? 0;
  const receivedPledges = val("cohort.received_pledges") ?? 0;
  const remaining = val("cohort.remaining");
  const ask = val("cohort.thedao_ask");
  const pool = val("cohort.thedao_pool");
  const capBinds = d.initiatives.some((i) => i.funding.remainingCents > THEDAO_ASK_CAP_CENTS);
  const cov = coverage(d);
  const cats = categoryDistribution(d).filter((c) => c.primaryCount > 0);
  const list = filterInitiatives(d, { limit: 100 });
  const funding = fundingRelationships(d);
  const recentFunding = changes(d, { kinds: ["funding_changed", "pledge_added", "pledge_removed", "pledge_status_changed", "pledge_amount_changed", "goal_changed", "donation_added"], limit: 5 });
  const recentScope = changes(d, { kinds: ["revision_added", "milestones_changed", "milestone_completed", "text_changed", "eligibility_changed", "claim_status_changed", "correction_published"], limit: 5 });
  const iniTitle = (id: string | null) => d.initiatives.find((i) => i.id === id);
  const cohortMonth = MONTH.format(Date.parse(d.meta.cohort.frozenAt));

  return (
    <div className="space-y-12">
      <PageHead
        eyebrow={
          <>
            Overview · Ballot cohort frozen <DateTime iso={d.meta.cohort.frozenAt} />
          </>
        }
        title={`Research on the ${d.initiatives.length} initiatives on TheDAO Security Fund ballot, ${cohortMonth}`}
        lede={
          <p>
            Figures come from the official TheDAO Security Fund API and the published research record. Applicant statements appear as quotes with their evidence status. Nothing on this site is ranked or scored.
          </p>
        }
      />

      <VoteCalendar view={calendarView(d)} />

      <section aria-label="Cohort figures">
        <dl className="grid grid-cols-2 gap-px border-y border-ink bg-rule sm:grid-cols-3 xl:grid-cols-6 [&>div]:bg-paper [&>div]:px-4 [&>div]:py-4">
          <Stat label="Qualified initiatives" value={<Num value={val("cohort.initiatives")} />} sub={`${grants} grants · ${rfps} RFPs`} />
          <Stat label="Funding requested" value={<Money cents={goal} />} sub="Sum of all funding goals" />
          <Stat
            label="Raised so far"
            value={<Money cents={val("cohort.raised")} />}
            sub={
              <>
                Pledged <Money cents={pledged} /> + received <Money cents={donated} />
              </>
            }
          />
          <Stat
            label="TheDAO ask"
            value={<Money cents={ask} reason={m["cohort.thedao_ask"]?.unavailableReason ?? undefined} />}
            sub={
              <>
                Sum over the {d.initiatives.length}, each capped at {formatUsd(THEDAO_ASK_CAP_CENTS)} · Pool <Money cents={pool} reason={m["cohort.thedao_pool"]?.unavailableReason ?? undefined} />
              </>
            }
          />
          <Stat
            label="Research coverage"
            value={<Pct value={val("cohort.research_coverage")} digits={0} />}
            sub={`${status.research.initiativesFullyResearched} of ${status.research.cohortSize} with every automated check complete`}
          />
          <Stat
            label="Last successful update"
            value={<span className="num text-[17px] max-sm:text-[15px]">{formatDate(status.officialSync.lastSuccessfulSyncAt)}</span>}
            sub={
              <>
                Official sync <DateTime iso={status.officialSync.lastSuccessfulSyncAt} withTime />
              </>
            }
          />
        </dl>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
          <FundingBar f={{ goalCents: goal, pledgedCents: pledged, donatedCents: donated, neededCents: remaining ?? undefined }} height={10} />
          <FundingLegend f={{ goalCents: goal, pledgedCents: pledged, donatedCents: donated, neededCents: remaining ?? undefined }} />
        </div>
        <Note className="mt-2 max-w-[880px]">
          TheDAO ask is each initiative&apos;s goal minus official raised, floored at $0 and capped at {formatUsd(THEDAO_ASK_CAP_CENTS)}. The remaining funding gap, shown separately, is <Money cents={remaining} /> (uncapped)
          {ask !== null && remaining !== null && !capBinds ? "; the two are equal while no initiative needs more than the cap." : "."} Received means confirmed onchain donations to initiative Safes. It already includes <Money cents={receivedPledges} /> of pledges marked received, so those are counted once. Pledged means outstanding commitments that have not arrived yet.
        </Note>
      </section>

      <SinceLastVisit view={fundingView(d)} />

      <div className="grid gap-12 lg:grid-cols-2 [&>*]:min-w-0">
        <Block
          title="Security coverage map"
          href="/research/coverage"
          hrefLabel="Full coverage map"
          note="Lifecycle stage of each initiative, from a rule-based reading of its proposal text. Dark: primary stage. Gray: also addresses. A prompt for investigation, not a finding."
        >
          <HBarList
            caption="Number of initiatives addressing each security lifecycle stage."
            rows={cov.stages.map((s) => ({
              key: s.stage,
              label: s.label,
              value: s.totalCount,
              inner: s.primaryCount,
              valueLabel: `${s.totalCount}`,
              sub: `${s.primaryCount} primary`,
              href: `/research?stage=${s.stage}`,
            }))}
          />
        </Block>
        <Block title="Funding by category" href="/research" hrefLabel="Filter by category" note="Grouped by each initiative's first official category, so every dollar is counted once. Gray: requested. Dark: raised.">
          <HBarList
            caption="Funding requested and raised per primary official category."
            rows={cats.map((c) => ({
              key: c.slug,
              label: c.label,
              value: c.goalCents,
              inner: c.raisedCents,
              valueLabel: formatUsd(c.goalCents, { compact: true }),
              sub: `${c.primaryCount} ${c.primaryCount === 1 ? "initiative" : "initiatives"}`,
              href: `/research?cat=${c.slug}`,
            }))}
          />
        </Block>
      </div>

      <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr] [&>*]:min-w-0">
        <Block title="Recent changes" href="/research/changes" hrefLabel="All changes" note="Detected by comparing official snapshots and proposal revisions.">
          <div className="grid gap-6 sm:grid-cols-2 [&>*]:min-w-0">
            {[
              { label: "Funding", rows: recentFunding },
              { label: "Proposal revisions", rows: recentScope },
            ].map((g) => (
              <div key={g.label}>
                <p className="eyebrow mb-1">{g.label}</p>
                {g.rows.length === 0 ? (
                  <Note>No changes recorded.</Note>
                ) : (
                  <ul className="divide-y divide-rule">
                    {g.rows.map((c) => {
                      const ini = iniTitle(c.initiativeId);
                      return (
                        <li key={c.id} className="py-2 text-sm">
                          <div className="flex items-baseline justify-between gap-3">
                            {ini ? (
                              <Link href={`/initiatives/${ini.slug}`} className="truncate font-medium hover:text-accent">
                                {ini.shortTitle}
                              </Link>
                            ) : (
                              <span className="font-medium">Cohort</span>
                            )}
                            <DateTime iso={c.detectedAt} className="shrink-0 text-2xs text-ink-3" />
                          </div>
                          <p className="mt-0.5 text-xs text-ink-2">{c.summary}</p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </Block>
        <div className="space-y-12">
          <Block title="Research shortcuts">
            <ul className="divide-y divide-rule">
              {ADVANCED_VIEWS.map((v) => (
                <li key={v.href}>
                  <Link href={v.href} className="group flex items-baseline justify-between gap-3 py-2 text-sm">
                    <span className="font-medium group-hover:text-accent">{v.label}</span>
                    <span className="truncate text-right text-xs text-ink-3">{v.hint}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Block>
          <Block title="Funding relationships" href="/research/funding" hrefLabel="Backers and pledges">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div>
                <dt className="text-xs text-ink-3">Pledge records</dt>
                <dd className="num">{d.pledges.length}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-3">Distinct backers</dt>
                <dd className="num">{funding.backers.length}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-3">Backers of more than one initiative</dt>
                <dd className="num">{funding.multiInitiativeBackers.length}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-3">Self-pledges (backer is the recipient)</dt>
                <dd className="num">{funding.selfPledges.length}</dd>
              </div>
            </dl>
            <Note className="mt-3">Anonymous pledge labels are never merged into one backer.</Note>
          </Block>
        </div>
      </div>

      <Block
        title="All initiatives"
        id="discovery"
        href="/research"
        hrefLabel="Search and filter"
        note={`${list.sortNote} ${d.initiatives.length} initiatives.`}
      >
        <ul className="grid gap-x-8 md:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
          {list.items.map((i) => (
            <li key={i.id} className="border-b border-rule py-2.5">
              <Link href={`/initiatives/${i.slug}`} className="group block">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-medium group-hover:text-accent" title={i.title}>
                    {i.shortTitle}
                  </span>
                </div>
                <div className="mt-0.5 flex items-baseline justify-between gap-3 text-xs text-ink-3">
                  <span className="truncate">{i.organization ?? i.recipientTeam ?? "Request for proposals, no designated recipient"}</span>
                  <span className="shrink-0">{i.type === "rfp" ? "RFP" : i.categories[0]?.label}</span>
                </div>
                <FundingBar f={i} height={4} className="mt-2" />
                <div className="mt-1 flex flex-wrap gap-x-3 text-2xs text-ink-3" data-funding-line>
                  <span>
                    Raised <Money cents={i.raisedCents} compact className="text-ink-2" />
                  </span>
                  <span>
                    Goal <Money cents={i.goalCents} compact className="text-ink-2" />
                  </span>
                  <span>
                    TheDAO ask <Money cents={i.theDaoAskCents} compact className="text-ink" reason="Goal or raised unavailable" />
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </Block>

      <details className="group border-t border-ink pt-3">
        <summary className="flex items-baseline justify-between gap-4">
          <span className="text-md font-semibold">Advanced analytics</span>
          <span className="text-xs text-ink-3 group-open:hidden">Show every cohort metric <ArrowRight /></span>
          <span className="hidden text-xs text-ink-3 group-open:inline">Hide</span>
        </summary>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <caption className="sr-only">Every cohort metric in the methodology registry with its current value.</caption>
            <thead>
              <tr className="border-b border-ink text-left text-2xs tracking-wide text-ink-3 uppercase">
                <th scope="col" className="py-2 pr-4 font-medium">
                  Metric
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">
                  Value
                </th>
                <th scope="col" className="py-2 font-medium">
                  Definition
                </th>
              </tr>
            </thead>
            <tbody>
              {METRICS.filter((x) => x.level === "cohort").map((def) => (
                <tr key={def.id} className="border-b border-rule align-top">
                  <th scope="row" className="py-2 pr-4 text-left font-medium">
                    {def.name}
                  </th>
                  <td className="num py-2 pr-4 text-right whitespace-nowrap">{metricText(def.unit, m[def.id]?.value ?? null)}</td>
                  <td className="py-2 text-xs text-ink-2">
                    {def.description} <span className="num text-ink-3">{def.formula}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Note className="mt-3">
            Methodology {d.meta.methodologyVersion}. <Link href="/methodology" className="link">Read the definitions</Link>. Categories in this round:{" "}
            {categoryDistribution(d).map((c) => (
              <Tag key={c.slug} className="mr-1 mb-1">
                {c.label} <span className="num ml-1 text-ink-3">{c.count}</span>
              </Tag>
            ))}
          </Note>
        </div>
      </details>
    </div>
  );
}
