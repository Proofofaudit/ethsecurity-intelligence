import Link from "next/link";
import { ArrowRight } from "@/components/ui/icons";
import { NameSearch } from "@/components/home/name-search";
import { BadgeKey } from "@/components/ui/badges";
import { Onboarding } from "@/components/home/onboarding";
import { WhyAiList } from "@/components/about/why-ai";
import { PageHead, Stat } from "@/components/ui/layout";
import { DateTime, formatDate } from "@/components/ui/money";
import { TheDaoStatus } from "@/components/ui/thedao-status";
import { automatedChecksLabel, teamResearchCompleteCount, teamResearchLabel } from "@/lib/team/progress";
import { loadTeamResearchFile } from "@/lib/team/load";
import { loadIntelligence } from "@/lib/intelligence/load";
import { changes, displayName } from "@/lib/intelligence/service";
import { ingestionStatus } from "@/lib/intelligence/status";
import { buildSearchIndex } from "@/lib/search/build";
import { loadBadgeHolders } from "@/lib/search/server";
import { ReviewProgressCompact } from "@/components/workspace/review-progress";
import { visitFeed } from "@/lib/workspace/feed";

export const dynamic = "force-dynamic";

const MONTH = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

export default async function OverviewPage() {
  const loaded = await loadIntelligence();
  const health = loaded.health;
  const d = loaded.dataset;
  const status = ingestionStatus(d, health);
  const team = loadTeamResearchFile();
  const teamDone = teamResearchCompleteCount(d.initiatives.map((i) => i.id));
  const index = buildSearchIndex(d, team);
  const holders = loadBadgeHolders();
  // Proposal and claim changes only. Funding movements stay on TheDAO.
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
      <BadgeKey />

      <Onboarding />

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
                Initiative list sync <DateTime iso={status.officialSync.lastSuccessfulSyncAt} withTime />
              </>
            }
          />
        </dl>
      </section>

      <TheDaoStatus href="https://initiatives.thedao.fund/" />

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

      <ReviewProgressCompact initiatives={d.initiatives.map((i) => ({ id: i.id, slug: i.slug, label: displayName(d, i) }))} feed={visitFeed(d)} datasetVersion={d.meta.datasetVersion} />
    </div>
  );
}
