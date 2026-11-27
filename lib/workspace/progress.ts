/**
 * Review progress (Item 13): per-initiative review states and change detection against the
 * published change feed. Pure functions, no browser APIs, no network. The feed comes from our own
 * dataset (see ./feed.ts); nothing here contacts TheDAO.
 */
import { z } from "zod";

const Id = z.string().min(1).max(120);
const When = z.string().max(40);

export const PROGRESS_STATES = ["not_started", "reading", "reviewed", "revisit"] as const;
export const ProgressState = z.enum(PROGRESS_STATES);
export type ProgressState = z.infer<typeof ProgressState>;

export const PROGRESS_LABEL: Record<ProgressState, string> = { not_started: "Not started", reading: "Reading", reviewed: "Reviewed", revisit: "Revisit" };

/** What the published record looked like for one initiative when it was last seen or reviewed. */
export const VisitSeen = z.object({
  revision: z.number().int().nullable(),
  commentCount: z.number().int().nullable(),
  changeIds: z.array(Id).max(1000),
});
export type VisitSeen = z.infer<typeof VisitSeen>;

export const ProgressMark = z.object({
  state: ProgressState,
  at: When,
  /** Why an initiative is marked Revisit; names the change. Null for the other states. */
  reason: z.string().max(600).nullable().default(null),
  /** The record at the time the mark was set; later changes are compared with it. */
  seen: VisitSeen.nullable().default(null),
});
export type ProgressMark = z.infer<typeof ProgressMark>;

export const VisitSnapshot = z.object({
  at: When,
  datasetVersion: z.string().max(120),
  initiatives: z.record(Id, VisitSeen),
});
export type VisitSnapshot = z.infer<typeof VisitSnapshot>;

/** `seen`: the latest page view. `baseline`: the record at the end of the previous visit. */
export const VisitState = z.object({ seen: VisitSnapshot.nullable().default(null), baseline: VisitSnapshot.nullable().default(null) });
export type VisitState = z.infer<typeof VisitState>;

export interface FeedChange {
  id: string;
  at: string;
  kind: string;
  summary: string;
}

export interface VisitFeedEntry {
  id: string;
  /** Latest official revision number, or null when none is published. */
  revision: number | null;
  /** Official comment count, or null when unavailable. Empty comments are normal. */
  commentCount: number | null;
  changes: FeedChange[];
}

export interface ChangeDelta {
  id: string;
  /** One sentence per real change, each naming the change. */
  reasons: string[];
  /** Reasons joined for display and for the Revisit mark. */
  reason: string;
}

export const counterText = (reviewed: number, total: number) => `You've reviewed ${reviewed} of ${total}.`;

export function seenFromEntry(e: VisitFeedEntry): VisitSeen {
  return { revision: e.revision, commentCount: e.commentCount, changeIds: e.changes.map((c) => c.id).slice(0, 1000) };
}

export function snapshotFromFeed(feed: VisitFeedEntry[], datasetVersion: string, now = new Date()): VisitSnapshot {
  return { at: now.toISOString(), datasetVersion, initiatives: Object.fromEntries(feed.map((e) => [e.id, seenFromEntry(e)])) };
}

const KIND_LABEL: Record<string, string> = {
  funding_changed: "Funding changed",
  goal_changed: "Funding goal changed",
  pledge_added: "New pledge",
  pledge_removed: "Pledge removed",
  pledge_status_changed: "Pledge status changed",
  pledge_amount_changed: "Pledge amount changed",
  donation_added: "New donation",
  milestones_changed: "Milestone edit",
  milestone_completed: "Milestone completed",
  text_changed: "Text diff",
  revision_added: "New revision",
  eligibility_changed: "Ballot eligibility changed",
  claim_status_changed: "Evidence status changed",
  correction_published: "Correction published",
};

function changeReason(c: FeedChange): string {
  const label = KIND_LABEL[c.kind] ?? "Record changed";
  const s = c.summary.trim();
  return s.toLowerCase().startsWith(label.toLowerCase()) ? s : `${label}: ${s}`;
}

/** Changes of one initiative since `seen`. Only real differences produce reasons. */
export function entryReasons(seen: VisitSeen | null | undefined, e: VisitFeedEntry): string[] {
  if (!seen) return [];
  const known = new Set(seen.changeIds);
  const fresh = e.changes.filter((c) => !known.has(c.id)).sort((a, b) => b.at.localeCompare(a.at) || (a.id < b.id ? -1 : 1));
  const reasons = fresh.map(changeReason);
  const revisionNamed = fresh.some((c) => c.kind === "revision_added" || c.kind === "text_changed");
  if (!revisionNamed && e.revision !== null && seen.revision !== null && e.revision > seen.revision) reasons.push(`New revision ${e.revision}`);
  if (e.commentCount !== null && seen.commentCount !== null && e.commentCount > seen.commentCount) {
    const n = e.commentCount - seen.commentCount;
    reasons.push(`${n} new ${n === 1 ? "comment" : "comments"}`);
  }
  return reasons;
}

export function joinReasons(reasons: string[]): string {
  if (reasons.length <= 2) return reasons.join("; ");
  return `${reasons.slice(0, 2).join("; ")}; and ${reasons.length - 2} more`;
}

/** Deltas of every initiative in the feed against a snapshot. First visit (no snapshot) yields none. */
export function detectChanges(snapshot: VisitSnapshot | null, feed: VisitFeedEntry[]): ChangeDelta[] {
  if (!snapshot) return [];
  const out: ChangeDelta[] = [];
  for (const e of feed) {
    const seen = snapshot.initiatives[e.id];
    if (!seen) continue;
    const reasons = entryReasons(seen, e);
    if (reasons.length) out.push({ id: e.id, reasons, reason: joinReasons(reasons) });
  }
  return out;
}

/**
 * Reviewed initiatives whose record changed after the review become Revisit with the reason.
 * Marks without changes are returned untouched (same object), so callers can detect "no change".
 */
export function applyRevisits(progress: Record<string, ProgressMark>, feed: VisitFeedEntry[], now = new Date()): Record<string, ProgressMark> {
  let next = progress;
  for (const e of feed) {
    const mark = progress[e.id];
    if (!mark || (mark.state !== "reviewed" && mark.state !== "revisit") || !mark.seen) continue;
    const reasons = entryReasons(mark.seen, e);
    if (!reasons.length) continue;
    const reason = joinReasons(reasons).slice(0, 600);
    if (mark.state === "revisit" && mark.reason === reason) continue;
    if (next === progress) next = { ...progress };
    next[e.id] = { ...mark, state: "revisit", reason, at: mark.state === "revisit" ? mark.at : now.toISOString() };
  }
  return next;
}

export function filterByState<T extends { id: string }>(items: T[], stateOf: (id: string) => ProgressState, filter: ProgressState | "all"): T[] {
  return filter === "all" ? items : items.filter((i) => stateOf(i.id) === filter);
}

/** Counts per state over the given ids. */
export function countStates(ids: string[], stateOf: (id: string) => ProgressState): Record<ProgressState, number> {
  const out: Record<ProgressState, number> = { not_started: 0, reading: 0, reviewed: 0, revisit: 0 };
  for (const id of ids) out[stateOf(id)]++;
  return out;
}

/** New visit gap, same as the funding baseline in ./schema (kept here to stay dependency free). */
const VISIT_GAP = 30 * 60 * 1000;

/** Records a page view. The previous snapshot becomes the baseline once the visit gap has passed. */
export function recordVisit(v: VisitState, snap: VisitSnapshot): VisitState {
  if (!v.seen) return { seen: snap, baseline: null };
  const gap = Date.parse(snap.at) - Date.parse(v.seen.at);
  const newVisit = !Number.isFinite(gap) || gap > VISIT_GAP;
  const sameRecord = JSON.stringify(v.seen.initiatives) === JSON.stringify(snap.initiatives);
  if (!newVisit && sameRecord && v.seen.datasetVersion === snap.datasetVersion) return v;
  return { seen: snap, baseline: newVisit ? v.seen : v.baseline };
}
