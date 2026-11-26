/**
 * Ingestion and data-freshness status, derived only from the published dataset meta and its
 * research jobs (both produced by the pipeline) plus the live store health. Shared by the
 * /api/v1/status endpoint, the admin status view and the MCP server.
 */
import { ResearchJob, type Dataset, type ResearchTask } from "@/lib/domain/schemas";
import type { StoreHealth } from "@/lib/db/types";
import { voteFeatureState } from "@/lib/vote/manifest";

/** Research tasks that must succeed for an initiative to count as fully researched. */
export const CORE_RESEARCH_TASKS: ResearchTask[] = ["websites", "github", "milestone_artifacts", "donations_onchain"];

/** Job states from the schema (internal identifiers, not display text). */
const STATES: readonly ResearchJob["state"][] = ResearchJob.shape.state.options;

const ageHours = (iso: string, now: Date) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.round(((now.getTime() - t) / 3_600_000) * 10) / 10 : null;
};

export function ingestionStatus(d: Dataset, health: StoreHealth, now = new Date()) {
  const m = d.meta;
  const byTask: Record<string, Record<ResearchJob["state"], number>> = {};
  for (const j of d.researchJobs) {
    byTask[j.task] ??= Object.fromEntries(STATES.map((s) => [s, 0])) as Record<ResearchJob["state"], number>;
    byTask[j.task]![j.state]++;
  }
  const complete = d.initiatives.filter((i) => CORE_RESEARCH_TASKS.every((t) => d.researchJobs.some((j) => j.initiativeId === i.id && j.task === t && j.state === "succeeded")));
  const failedJobs = d.researchJobs.filter((j) => j.state === "failed").map((j) => ({ initiativeId: j.initiativeId, task: j.task, attempts: j.attempts, error: j.error, finishedAt: j.finishedAt }));
  return {
    store: health,
    officialSync: {
      snapshotId: m.snapshotId,
      previousPublishedSnapshotId: m.previousSnapshotId,
      lastSuccessfulSyncAt: m.ingestion.startedAt,
      lastSuccessfulSyncNote: "Start time of the official sync that produced the published snapshot (the latest snapshot that passed validation).",
      officialDataGeneratedAt: m.officialGeneratedAt,
      source: m.officialSourceUrl,
      requests: m.ingestion.requests,
      failedRequestCount: m.ingestion.failedRequests.length,
      failedRequests: m.ingestion.failedRequests,
      validation: m.ingestion.validation,
      validationPassed: m.ingestion.validation.every((v) => v.ok),
    },
    freshness: {
      checkedAt: now.toISOString(),
      officialDataAgeHours: ageHours(m.officialGeneratedAt, now),
      publishedAt: m.generatedAt,
      publishedAgeHours: ageHours(m.generatedAt, now),
    },
    voteManifest: {
      ...voteFeatureState(d.vote),
      statusReason: d.vote.statusReason,
      source: d.vote.sourceUrl,
      fetchedAt: d.vote.fetchedAt,
      stale: d.vote.stale,
      configRevision: d.vote.configRevision,
      readAt: d.vote.readAt,
      slugs: d.vote.slugs.length,
      projects: d.vote.projects.length,
      groups: d.vote.groups.length,
      alignment: d.vote.alignment,
      note: "slugs[i] and projects[i] are re-checked against the ballot records on every sync. If the check fails, nothing is remapped and features that depend on affiliation groups stay disabled until the manifest is confirmed.",
    },
    research: {
      run: m.research,
      cohortSize: m.cohort.size,
      coreTasks: CORE_RESEARCH_TASKS,
      initiativesFullyResearched: complete.length,
      initiativesMissingResearch: d.initiatives.filter((i) => !complete.includes(i)).map((i) => ({ id: i.id, slug: i.slug })),
      jobsByTask: byTask,
      failedJobs,
    },
    publication: {
      datasetVersion: m.datasetVersion,
      contentHash: m.contentHash,
      methodologyVersion: m.methodologyVersion,
      guard: "Only the latest snapshot marked valid is used, and the published dataset is replaced only when the schema invariants and the truth audit pass. Otherwise the previous dataset stays in place.",
    },
  };
}
export type IngestionStatus = ReturnType<typeof ingestionStatus>;
