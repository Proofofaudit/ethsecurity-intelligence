import type { Metadata } from "next";
import { WorkspaceView } from "@/components/workspace/view";
import type { ChangeRef } from "@/components/workspace/schema";
import { PageHead } from "@/components/ui/layout";
import { loadIntelligence } from "@/lib/intelligence/load";
import { displayName } from "@/lib/intelligence/service";
import { affiliationView, ballotView, calendarView, fundingView, interestView } from "@/lib/vote/view-data";
import { exportContext, visitFeed } from "@/lib/workspace/feed";

export const metadata: Metadata = { title: "My Ballot" };
export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const d = (await loadIntelligence()).dataset;
  const initiatives = [...d.initiatives].map((i) => ({ id: i.id, slug: i.slug, label: displayName(d, i), sub: i.type === "rfp" ? "RFP" : (d.organizations.find((o) => o.id === i.organizationId)?.name ?? null) })).sort((a, b) => a.label.localeCompare(b.label));
  const changes: Record<string, ChangeRef[]> = {};
  for (const c of d.changes) if (c.initiativeId) (changes[c.initiativeId] ??= []).push({ id: c.id, at: c.detectedAt, kind: c.kind, summary: c.summary });

  return (
    <>
      <PageHead
        eyebrow="My Ballot"
        title="Your private research workspace"
        lede={<p>Saved initiatives, notes and review progress stay in this browser. Voting happens only on TheDAO&apos;s site. This page never connects a wallet. To show the current status of bookmarked evidence, it requests each bookmarked statement&apos;s public record by its id.</p>}
      />
      <WorkspaceView initiatives={initiatives} changes={changes} datasetVersion={d.meta.datasetVersion} review={{ feed: visitFeed(d), exportContext: exportContext(d) }} vote={{ calendar: calendarView(d), funding: fundingView(d), ballot: ballotView(d), affiliation: affiliationView(d), interest: interestView(d) }} />
    </>
  );
}
