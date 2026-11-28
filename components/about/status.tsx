import Link from "next/link";
import type { ReactNode } from "react";
import { ExternalLink } from "@/components/ui/button";
import { Block, Note, PageHead, Stat } from "@/components/ui/layout";
import { DateTime, formatDateTime, Money } from "@/components/ui/money";
import { loadIntelligence } from "@/lib/intelligence/load";
import { displayName } from "@/lib/intelligence/service";
import { ingestionStatus } from "@/lib/intelligence/status";
import { cn } from "@/lib/util/cn";
import { FALLBACK_LABEL, FALLBACK_SETTLED_BY, FALLBACK_TALLIES, resolveSchedule } from "@/lib/vote/calendar";
import { withLiveVote } from "@/lib/vote/live";

const TASK_LABEL: Record<string, string> = {
  links: "Link extraction",
  websites: "Website checks",
  github: "GitHub repositories",
  milestone_artifacts: "Milestone artifacts",
  claims: "Claim extraction",
  donations_onchain: "Onchain donations",
  curated: "Curated findings",
};

function Ok({ ok, children }: { ok: boolean; children: ReactNode }) {
  return <span className={cn("text-xs font-medium", ok ? "text-st-verified" : "text-st-contradicted")}>{children}</span>;
}

const VOTE_STATUS_LABEL = { aligned: "Aligned", unaligned: "Not aligned: group features disabled", unavailable: "Unavailable: dependent features disabled" } as const;

const UTC = new Intl.DateTimeFormat("en-US", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC", timeZoneName: "short" });

const hours = (h: number | null) => (h === null ? "unknown" : h < 48 ? `${h} hours` : `${Math.round(h / 24)} days`);

export async function FreshnessSection() {
  const loaded = await loadIntelligence();
  const health = loaded.health;
  // Pool and schedule from the cached live manifest read when valid; everything else is the published snapshot.
  const { dataset: d, live } = await withLiveVote(loaded.dataset);
  const s = ingestionStatus(d, health);
  const staleCheck = s.officialSync.validation.find((v) => v.check === "details_complete");
  const byId = new Map(d.initiatives.map((i) => [i.id, i]));
  const vm = s.voteManifest;
  const pool = d.vote.poolCents;

  return (
    <div className="space-y-10">
      <PageHead
        as="h2"
        eyebrow="Reference · Data freshness"
        title="Sync, research and publication status"
        lede={<p>When the official data was last read, what the research pipeline checked, and which store is serving this page. Checked {formatDateTime(s.freshness.checkedAt)}.</p>}
      />

      <dl className="grid grid-cols-2 gap-px border-y border-ink bg-rule sm:grid-cols-3 xl:grid-cols-6 [&>div]:bg-paper [&>div]:px-4 [&>div]:py-4">
        <Stat label="Last successful official sync" value={<span className="num text-[17px]">{formatDateTime(s.officialSync.lastSuccessfulSyncAt)}</span>} />
        <Stat label="Official data generated" value={<span className="num text-[17px]">{formatDateTime(s.officialSync.officialDataGeneratedAt)}</span>} sub={`${hours(s.freshness.officialDataAgeHours)} ago`} />
        <Stat label="Published" value={<span className="num text-[17px]">{formatDateTime(s.freshness.publishedAt)}</span>} sub={`${hours(s.freshness.publishedAgeHours)} ago`} />
        <Stat label="Official requests" value={<span className="num">{s.officialSync.requests}</span>} sub={`${s.officialSync.failedRequestCount} failed`} />
        <Stat label="Fully researched" value={<span className="num">{`${s.research.initiativesFullyResearched} of ${s.research.cohortSize}`}</span>} sub="Every core research task succeeded" />
        <Stat label="Store" value={<span className="text-[17px]">{s.store.backend === "mongodb" ? "MongoDB" : "Published files"}</span>} sub={s.store.degraded ? "Degraded: serving the file fallback" : s.store.ok ? "Healthy" : "Unavailable"} />
      </dl>
      <Note>{s.officialSync.lastSuccessfulSyncNote}</Note>

      <div className="grid gap-10 lg:grid-cols-2 [&>*]:min-w-0">
        <Block title="Official sync validation" note={<>Snapshot <span className="num">{s.officialSync.snapshotId}</span>. Source <ExternalLink href={s.officialSync.source}>TheDAO Security Fund API</ExternalLink>.</>}>
          <ul className="divide-y divide-rule text-sm">
            {s.officialSync.validation.map((v) => (
              <li key={v.check} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-1.5">
                <span className="min-w-0">
                  <span className="num text-xs">{v.check}</span>
                  <span className="block text-xs text-ink-3">{v.detail}</span>
                </span>
                <Ok ok={v.ok}>{v.ok ? "Passed" : "Failed"}</Ok>
              </li>
            ))}
          </ul>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
            <dt className="text-ink-3">Stale objects</dt>
            <dd>{staleCheck ? staleCheck.detail : "Not reported"}</dd>
            <dt className="text-ink-3">Failed requests</dt>
            <dd>
              {s.officialSync.failedRequests.length === 0 ? (
                "None"
              ) : (
                <ul className="space-y-0.5">
                  {s.officialSync.failedRequests.map((f) => (
                    <li key={f.url} className="break-all">
                      {f.url}: {f.error}
                    </li>
                  ))}
                </ul>
              )}
            </dd>
            <dt className="text-ink-3">Previous snapshot</dt>
            <dd className="num">{s.officialSync.previousPublishedSnapshotId ?? "None"}</dd>
          </dl>
        </Block>

        <Block
          title="Research coverage by task"
          note={
            s.research.run ? (
              <>
                Last research run <DateTime iso={s.research.run.startedAt} withTime /> ({s.research.run.pipelineVersion}), {s.research.run.requests} requests, {s.research.run.failures} failures. Core tasks: {s.research.coreTasks.map((t) => TASK_LABEL[t] ?? t).join(", ")}.
              </>
            ) : (
              "No research run is recorded."
            )
          }
        >
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Research jobs table, scrolls sideways">
            <table className="w-full min-w-[420px] text-sm">
              <caption className="sr-only">Research jobs by task and state</caption>
              <thead>
                <tr className="border-b border-ink text-left text-2xs tracking-wide text-ink-3 uppercase">
                  {["Task", "Succeeded", "Failed", "Not run", "Pending"].map((h, i) => (
                    <th key={h} scope="col" className={cn("py-2 font-medium", i > 0 && "text-right")}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(s.research.jobsByTask)
                  .sort((a, b) => (TASK_LABEL[a[0]] ?? a[0]).localeCompare(TASK_LABEL[b[0]] ?? b[0]))
                  .map(([task, c]) => (
                    <tr key={task} className="border-b border-rule">
                      <th scope="row" className="py-1.5 text-left font-normal">
                        {TASK_LABEL[task] ?? task}
                      </th>
                      <td className="num py-1.5 text-right">{c.succeeded}</td>
                      <td className={cn("num py-1.5 text-right", c.failed > 0 && "text-st-contradicted")}>{c.failed}</td>
                      <td className="num py-1.5 text-right">{c.skipped}</td>
                      <td className="num py-1.5 text-right">{c.pending + c.running}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {s.research.failedJobs.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs">
              {s.research.failedJobs.map((j) => (
                <li key={`${j.initiativeId}-${j.task}`}>
                  <Link href={`/initiatives/${byId.get(j.initiativeId)?.slug}`} className="link">
                    {byId.get(j.initiativeId) ? displayName(d, byId.get(j.initiativeId)!) : j.initiativeId}
                  </Link>{" "}
                  · {TASK_LABEL[j.task] ?? j.task}: {j.error ?? "failed"} ({j.attempts} attempts)
                </li>
              ))}
            </ul>
          )}
          {s.research.initiativesMissingResearch.length > 0 && <p className="mt-3 text-xs text-ink-3">Not fully researched: {s.research.initiativesMissingResearch.map((x) => (byId.get(x.id) ? displayName(d, byId.get(x.id)!) : x.slug)).join(", ")}.</p>}
        </Block>
      </div>

      <Block
        title="Official vote manifest"
        note={
          <>
            Source <ExternalLink href={vm.source}>/api/vote/manifest</ExternalLink>. {vm.note}
          </>
        }
      >
        <dl className="grid max-w-[860px] grid-cols-[minmax(0,10rem)_1fr] gap-x-4 gap-y-1.5 text-sm max-sm:grid-cols-1">
          <dt className="text-ink-3">Status</dt>
          <dd data-vote-status={vm.status}>
            <Ok ok={vm.status === "aligned"}>{VOTE_STATUS_LABEL[vm.status]}</Ok>
            <span className="block text-xs text-ink-3">{vm.statusReason}</span>
          </dd>
          <dt className="text-ink-3">Snapshot fetched</dt>
          <dd>
            {vm.fetchedAt ? formatDateTime(vm.fetchedAt) : "Not fetched"}
            {vm.stale && " (stored copy reused: the latest fetch failed)"}
          </dd>
          <dt className="text-ink-3">Live pool and schedule</dt>
          <dd data-live-manifest={live.source}>
            {live.source === "live" ? <span>Live manifest read {live.fetchedAt ? formatDateTime(live.fetchedAt) : ""}</span> : <span>Published snapshot</span>}
            <span className="block text-xs text-ink-3">
              {live.note}
              {live.checkedAt && ` Last read attempt ${formatDateTime(live.checkedAt)}.`}
            </span>
            {live.error && <span className="block text-xs text-st-contradicted">{live.error}</span>}
          </dd>
          <dt className="text-ink-3">Contents</dt>
          <dd className="num">
            {vm.slugs} slugs · {vm.projects} projects · {vm.groups} affiliation groups
            {vm.configRevision !== null && ` · config revision ${vm.configRevision}`}
          </dd>
          <dt className="text-ink-3">Pool</dt>
          <dd>
            <Money cents={pool} reason="Vote manifest unavailable" />
          </dd>
          <dt className="text-ink-3">Tier tally starts</dt>
          <dd className="num">
            {d.vote.scheduleAvailable && d.vote.schedule
              ? d.vote.schedule.firstTallyAt.map((t, i) => `${["S", "A", "B"][i] ?? i}-tier ${UTC.format(t * 1000)}`).join(" · ")
              : "Unavailable"}
          </dd>
          <dt className="text-ink-3">Vote Calendar countdown</dt>
          <dd data-calendar-fallback={resolveSchedule(d.vote).fallback ? "" : undefined}>
            {resolveSchedule(d.vote).fallback ? (
              <Ok ok={false}>
                {FALLBACK_LABEL}: schedule.firstTallyAt is missing, so the documented fallbacks from TheDAO&apos;s voting post are used: {FALLBACK_TALLIES.map((t, i) => `${["S", "A", "B"][i]}-tier ${UTC.format(Date.parse(t))}`).join(" · ")}; settled after {UTC.format(Date.parse(FALLBACK_SETTLED_BY))}
              </Ok>
            ) : (
              <span>From the manifest (schedule.firstTallyAt)</span>
            )}
          </dd>
          <dt className="text-ink-3">Disabled features</dt>
          <dd>{vm.disabled.length ? vm.disabled.join(", ") : "None"}</dd>
        </dl>
        <ul className="mt-3 max-w-[860px] divide-y divide-rule text-sm">
          {vm.alignment.checks.map((c) => (
            <li key={c.check} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-1.5">
              <span className="min-w-0">
                <span className="num text-xs">{c.check}</span>
                <span className="block text-xs break-words text-ink-3">{c.detail}</span>
              </span>
              <Ok ok={c.ok}>{c.ok ? "Passed" : "Failed"}</Ok>
            </li>
          ))}
        </ul>
      </Block>

      <Block title="Publication">
        <dl className="grid max-w-[860px] grid-cols-[minmax(0,10rem)_1fr] gap-x-4 gap-y-1.5 text-sm max-sm:grid-cols-1">
          <dt className="text-ink-3">Dataset version</dt>
          <dd className="num break-all">{s.publication.datasetVersion}</dd>
          <dt className="text-ink-3">Content hash</dt>
          <dd className="num break-all">{s.publication.contentHash}</dd>
          <dt className="text-ink-3">Methodology</dt>
          <dd className="num">{s.publication.methodologyVersion}</dd>
          <dt className="text-ink-3">Store detail</dt>
          <dd>{s.store.detail}</dd>
          <dt className="text-ink-3">Publication guard</dt>
          <dd className="text-ink-2">{s.publication.guard}</dd>
        </dl>
        <p className="mt-3 text-xs text-ink-3">
          The same data is available as JSON at{" "}
          <a href="/api/v1/status" className="link">
            /api/v1/status
          </a>
          .
        </p>
      </Block>
    </div>
  );
}
