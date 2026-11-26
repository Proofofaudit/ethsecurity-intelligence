/**
 * Serializable props for the Vote Calendar, "since last visit" and Ballot Prep client components,
 * built from the published dataset on the server. Money stays exact: goals as the manifest's
 * micro-USD strings, asks as integer cents.
 */
import type { Dataset } from "@/lib/domain/schemas";
import { displayName } from "@/lib/intelligence/service";
import { resolveSchedule, type VoteSchedule } from "./calendar";
import { voteFeatureState } from "./manifest";

export interface FundingView {
  datasetVersion: string;
  /** When TheDAO's API produced the official data behind the asks. */
  asOf: string;
  /** Set when the latest fetch failed and a stored snapshot is shown. */
  staleNote: string | null;
  asks: Record<string, number | null>;
  names: Record<string, { label: string; slug: string }>;
}

export interface CalendarView {
  schedule: VoteSchedule;
  manifestFetchedAt: string | null;
}

export interface BallotItem {
  id: string;
  slug: string;
  label: string;
  sub: string | null;
  rfp: boolean;
  goalMicro: string | null;
  askCents: number | null;
  groups: string[];
}

export interface BallotView {
  /** Why the rule checks are off; null when they run. */
  disabledReason: string | null;
  poolMicro: string | null;
  independentTiers: number;
  items: BallotItem[];
}

export function fundingView(d: Dataset): FundingView {
  const asks: FundingView["asks"] = {};
  const names: FundingView["names"] = {};
  for (const i of d.initiatives) {
    asks[i.id] = i.funding.theDaoAskCents;
    names[i.id] = { label: displayName(d, i), slug: i.slug };
  }
  const failed = d.meta.ingestion.failedRequests.length;
  const notes: string[] = [];
  if (d.vote.stale) notes.push(`The latest vote manifest fetch failed; the stored manifest${d.vote.fetchedAt ? ` fetched ${d.vote.fetchedAt.slice(0, 16).replace("T", " ")} UTC` : ""} is shown.`);
  if (failed > 0) notes.push(`${failed} official ${failed === 1 ? "request" : "requests"} failed in the latest sync; affected figures come from the last stored snapshot.`);
  return { datasetVersion: d.meta.datasetVersion, asOf: d.meta.officialGeneratedAt, staleNote: notes.length ? notes.join(" ") : null, asks, names };
}

export function calendarView(d: Dataset): CalendarView {
  return { schedule: resolveSchedule(d.vote), manifestFetchedAt: d.vote.fetchedAt };
}

export function ballotView(d: Dataset): BallotView {
  const v = d.vote;
  const state = voteFeatureState(v);
  const checksOff = state.disabled.includes("Ballot Prep checks");
  const index = new Map(v.slugs.map((s, i) => [s, i]));
  const items = d.initiatives
    .map((i) => {
      const p = v.groupsAvailable ? v.projects[index.get(i.slug) ?? -1] : undefined;
      return {
        id: i.id,
        slug: i.slug,
        label: displayName(d, i),
        sub: i.type === "rfp" ? "RFP" : (d.organizations.find((o) => o.id === i.organizationId)?.name ?? null),
        rfp: i.type === "rfp",
        goalMicro: p ? p.goalMicroUsd : null,
        askCents: i.funding.theDaoAskCents,
        groups: v.groupsAvailable ? (v.initiativeGroups[i.id] ?? []) : [],
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
  const missingGoal = items.some((i) => i.goalMicro === null);
  return {
    disabledReason: checksOff ? `The official vote manifest is unavailable or not confirmed (${v.statusReason}). Rule checks are off; you can still place initiatives.` : missingGoal ? "A registered goal is missing from the manifest, so the rule checks are off." : null,
    poolMicro: v.poolMicroUsd,
    independentTiers: v.independentTiers ?? 1,
    items,
  };
}
