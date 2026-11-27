import type { Metadata } from "next";
import { WorkspaceView } from "@/components/workspace/view";
import type { ChangeRef } from "@/components/workspace/schema";
import { PageHead } from "@/components/ui/layout";
import { loadIntelligence } from "@/lib/intelligence/load";
import { displayName } from "@/lib/intelligence/service";
import { affiliationView, ballotView, calendarView, fundingView, interestView } from "@/lib/vote/view-data";
import { withLiveVote } from "@/lib/vote/live";
import { exportContext, visitFeed } from "@/lib/workspace/feed";

export const metadata: Metadata = { title: "My Workspace" };
// Rendered per request so pool and schedule are never older than the 12-minute live cache (an ISR page cache would add up to its own age on top).
export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const { dataset: d, live } = await withLiveVote((await loadIntelligence()).dataset);
  const initiatives = [...d.initiatives].map((i) => ({ id: i.id, slug: i.slug, label: displayName(d, i), sub: i.type === "rfp" ? "RFP" : (d.organizations.find((o) => o.id === i.organizationId)?.name ?? null) })).sort((a, b) => a.label.localeCompare(b.label));
  const changes: Record<string, ChangeRef[]> = {};
  for (const c of d.changes) if (c.initiativeId) (changes[c.initiativeId] ??= []).push({ id: c.id, at: c.detectedAt, kind: c.kind, summary: c.summary });

  return (
    <>
      <PageHead
        eyebrow="My Workspace"
        title="Your private research workspace"
        lede={<p>Vote calendar, a starting set that may interest you, your affiliations, Ballot Prep, saved initiatives, bookmarked evidence, comparisons, notes, open questions and assessments. Everything on this page is stored in this browser only. There is no account, and nothing here is sent to the server.</p>}
      />
      <WorkspaceView initiatives={initiatives} changes={changes} datasetVersion={d.meta.datasetVersion} review={{ feed: visitFeed(d), exportContext: exportContext(d) }} vote={{ calendar: calendarView(d, live), funding: fundingView(d), ballot: ballotView(d, live), affiliation: affiliationView(d), interest: interestView(d) }} />
    </>
  );
}
