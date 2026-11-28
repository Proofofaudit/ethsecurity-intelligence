import Link from "next/link";
import { ArrowRight } from "@/components/ui/icons";
import { FundingBar, FundingLegend } from "@/components/ui/charts";
import { OfficialStrip } from "@/components/home/official-strip";
import { NameSearch } from "@/components/home/name-search";
import { Onboarding } from "@/components/home/onboarding";
import { WhyAiList } from "@/components/about/why-ai";
import { Note, PageHead, Stat } from "@/components/ui/layout";
import { DateTime, formatDate, Money, Num } from "@/components/ui/money";
import { Tag } from "@/components/ui/button";
import { automatedChecksLabel, teamResearchCompleteCount, teamResearchLabel } from "@/lib/team/progress";
import { loadTeamResearchFile } from "@/lib/team/load";
import { loadIntelligence } from "@/lib/intelligence/load";
import { categoryDistribution, changes, displayName } from "@/lib/intelligence/service";
import { ingestionStatus } from "@/lib/intelligence/status";
import { cohortMetrics } from "@/lib/metrics/compute";
import { METRICS } from "@/lib/metrics/registry";
import { THEDAO_ASK_CAP_CENTS } from "@/lib/metrics/ask";
import { buildSearchIndex } from "@/lib/search/build";
import { loadBadgeHolders } from "@/lib/search/server";
import { formatPct, formatUsd } from "@/lib/util/money";
import { SinceLastVisit } from "@/components/workspace/since-visit";
import { ReviewProgressCompact } from "@/components/workspace/review-progress";
import { visitFeed } from "@/lib/workspace/feed";
import { VoteCalendar } from "@/components/workspace/vote-calendar";
import { calendarView, fundingView } from "@/lib/vote/view-data";
import { withLiveVote } from "@/lib/vote/live";

// Rendered per request so pool and schedule are never older than the 12-minute live cache (an ISR page cache would add up to its own age on top).
export const dynamic = "force-dynamic";

const MONTH = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

function metricText(unit: string, v: number | null) {
  if (v === null) return "Unavailable";
  if (unit === "usd_cents") return formatUsd(v);
  if (unit === "ratio") return formatPct(v);
  if (unit === "index") return v.toFixed(3);
  return v.toLocaleString("en-US");
}

export default async function OverviewPage() {
  const loaded = await loadIntelligence();
  const health = loaded.health;
  // Pool and schedule from the cached live manifest read (at most every 12 minutes); the rest is the published snapshot.
  const { dataset: d, live } = await withLiveVote(loaded.dataset);
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
  const team = loadTeamResearchFile();
  const teamDone = teamResearchCompleteCount(d.initiatives.map((i) => i.id));
  const index = buildSearchIndex(d, team);
  // Holders are parsed on the server from public columns only; null when the CSV is not present.
  const holders = loadBadgeHolders();
  // One quiet line: the latest change to proposals or claims. Funding figures are not repeated here.
  const latest = changes(d, { kinds: ["revision_added", "milestones_changed", "milestone_completed", "text_changed", "eligibility_changed", "claim_status_changed", "correction_published"], limit: 1 })[0];
  const latestIni = latest ? d.initiatives.find((i) => i.id === latest.initiativeId) : undefined;
  const cohortMonth = MONTH.format(Date.parse(d.meta.cohort.frozenAt));

  return (
    <div className="space-y-10">
      <PageHead
        eyebrow={
          <>
            Home · Ballot cohort frozen <DateTime iso={d.meta.cohort.frozenAt} />
          </>
        }
        title={`Research on the ${d.initiatives.length} initiatives on TheDAO Security Fund ballot, ${cohortMonth}`}
        lede={<p>Public research on each team, what it has shipped and who it works with. Voting happens only on TheDAO&apos;s site.</p>}
      />

      <NameSearch holders={holders} index={index} total={d.initiatives.length} />

      <Onboarding />

      <VoteCalendar view={calendarView(d, live)} compact />

      <p className="text-sm text-ink-3" data-what-changed>
        <span className="font-medium text-ink-2">What changed:</span>{" "}
        {latest ? (
          <>
            {latestIni ? `${latestIni.shortTitle}, ` : ""}
            {latest.summary} (<DateTime iso={latest.detectedAt} />).{" "}
          </>
        ) : (
          "No changes recorded. "
        )}
        <Link href="/initiatives#changes" className="link">
          All changes
        </Link>
      </p>

      <section aria-label="People map" className="border-y border-rule py-3 text-sm" data-people-map-entry>
        <Link href="/teams" className="group flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="font-medium group-hover:text-accent">People map</span>
          <span className="text-ink-3">
            See who works with whom across the {d.initiatives.length} initiatives, on Teams <ArrowRight />
          </span>
        </Link>
      </section>

      <section aria-label="Research status">
        <dl className="grid grid-cols-1 gap-px border-y border-ink bg-rule sm:grid-cols-3 [&>div]:bg-paper [&>div]:px-4 [&>div]:py-4">
          <Stat
            label="Automated checks"
            value={<span className="num">{`${status.research.initiativesFullyResearched} of ${status.research.cohortSize}`}</span>}
            sub={automatedChecksLabel(status.research.initiativesFullyResearched, status.research.cohortSize)}
          />
          <Stat
            label="Team research"
            value={<span className="num">{`${teamDone} of ${d.initiatives.length}`}</span>}
            sub={teamResearchLabel(teamDone, d.initiatives.length)}
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
      </section>

      <OfficialStrip
        officialUrl={d.meta.officialSourceUrl}
        officialHost={new URL(d.meta.officialSourceUrl).host}
        metrics={[
          {
            label: "TheDAO ask",
            headline: true,
            value: <Money cents={ask} reason={m["cohort.thedao_ask"]?.unavailableReason ?? undefined} />,
            sub: (
              <>
                Each initiative capped at {formatUsd(THEDAO_ASK_CAP_CENTS)} · Pool <Money cents={pool} reason={m["cohort.thedao_pool"]?.unavailableReason ?? undefined} />
              </>
            ),
            help: "How much the fund is asked to pay in total. For each initiative it is the goal minus what is already raised, never below $0 and never above the cap, added up over the cohort.",
          },
          { label: "Qualified initiatives", value: <Num value={val("cohort.initiatives")} />, sub: `${grants} grants · ${rfps} RFPs`, help: "Initiatives that qualified for the current ballot round." },
          { label: "Funding requested", value: <Money cents={goal} />, sub: "Sum of all funding goals", help: "The total of every initiative's funding goal, as stated in the official record." },
          {
            label: "Raised so far",
            value: <Money cents={val("cohort.raised")} />,
            sub: (
              <>
                Pledged <Money cents={pledged} /> + received <Money cents={donated} />
              </>
            ),
            help: "Outstanding pledges plus confirmed onchain donations. A pledge marked received is counted once, as a donation.",
          },
        ]}
      >
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
          <FundingBar f={{ goalCents: goal, pledgedCents: pledged, donatedCents: donated, neededCents: remaining ?? undefined }} height={10} />
          <FundingLegend f={{ goalCents: goal, pledgedCents: pledged, donatedCents: donated, neededCents: remaining ?? undefined }} />
        </div>
        <Note className="mt-2 max-w-[880px]">
          TheDAO ask is each initiative&apos;s goal minus official raised, floored at $0 and capped at {formatUsd(THEDAO_ASK_CAP_CENTS)}. The remaining funding gap, shown separately, is <Money cents={remaining} /> (uncapped)
          {ask !== null && remaining !== null && !capBinds ? "; the two are equal while no initiative needs more than the cap." : "."} Received means confirmed onchain donations to initiative Safes. It already includes <Money cents={receivedPledges} /> of pledges marked received, so those are counted once. Pledged means outstanding commitments that have not arrived yet. These figures are live on TheDAO&apos;s own site; this strip is a copy from the latest sync.
        </Note>
      </OfficialStrip>

      <section aria-labelledby="why-ai-h" data-why-ai>
        <h2 id="why-ai-h" className="mb-2 text-md font-semibold">
          Why AI is here
        </h2>
        <WhyAiList />
        <p className="mt-2 text-xs">
          <Link href="/about#ai" className="link">
            More on About
          </Link>
        </p>
      </section>

      <SinceLastVisit view={fundingView(d)} />

      <ReviewProgressCompact initiatives={d.initiatives.map((i) => ({ id: i.id, slug: i.slug, label: displayName(d, i) }))} feed={visitFeed(d)} datasetVersion={d.meta.datasetVersion} />

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
            Methodology {d.meta.methodologyVersion}. <Link href="/about#methodology" className="link">Read the definitions</Link>. Categories in this round:{" "}
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
