/**
 * Private workspace data model (pure, no browser APIs, so it is unit-testable).
 * Version 1 is extended additively: every field added after the first release has a default,
 * so workspaces saved by earlier builds still parse.
 */
import { z } from "zod";
import { EvidenceStatus } from "@/lib/domain/schemas";
import { ProgressMark, VisitState } from "@/lib/workspace/progress";

const Id = z.string().min(1).max(120);
const When = z.string().max(40);
const Text = (max: number) => z.string().max(max);

export const Priority = z.enum(["high", "medium", "low"]);
export type Priority = z.infer<typeof Priority>;

export const SavedInitiative = z.object({
  id: Id,
  addedAt: When,
  reviewedAt: When.nullable().default(null),
  priority: Priority.nullable().default(null),
});

export const SavedSearch = z.object({ id: Id, name: Text(120), query: Text(2000), createdAt: When });
export type SavedSearch = z.infer<typeof SavedSearch>;

export const Bookmark = z.object({
  id: Id,
  claimId: Id,
  initiativeId: Id,
  assertion: Text(400),
  /** Evidence status when the bookmark was saved; compared with the current status. */
  status: EvidenceStatus,
  savedAt: When,
});
export type Bookmark = z.infer<typeof Bookmark>;

export const SavedComparison = z.object({ id: Id, name: Text(160), ids: z.array(Id).min(2).max(5), createdAt: When });
export type SavedComparison = z.infer<typeof SavedComparison>;

export const Note = z.object({ id: Id, initiativeId: Id.nullable(), text: Text(5000), createdAt: When, updatedAt: When });
export type Note = z.infer<typeof Note>;

export const Question = z.object({ id: Id, initiativeId: Id.nullable(), text: Text(1000), createdAt: When, resolvedAt: When.nullable().default(null) });
export type Question = z.infer<typeof Question>;

export const ResearchPriority = z.object({ id: Id, text: Text(500), createdAt: When, done: z.boolean().default(false) });
export type ResearchPriority = z.infer<typeof ResearchPriority>;

/** What the published record looked like when an assessment was written. */
export const Fingerprint = z.object({
  datasetVersion: Text(120),
  changeIds: z.array(Id).max(1000),
  latestChangeAt: When.nullable(),
});
export type Fingerprint = z.infer<typeof Fingerprint>;

export const Assessment = z.object({ id: Id, initiativeId: Id, text: Text(5000), savedAt: When, fingerprint: Fingerprint });
export type Assessment = z.infer<typeof Assessment>;

export const LastVisited = z.object({ path: Text(500), title: Text(300), at: When });

/** TheDAO ask per initiative id (integer cents, null when unavailable) as last seen in this browser. */
export const FundingSnapshot = z.object({ datasetVersion: Text(120), at: When, asks: z.record(Id, z.number().int().nullable()) });
export type FundingSnapshot = z.infer<typeof FundingSnapshot>;

/**
 * `seen`: the asks shown on the latest page view. `baseline`: what was seen at the end of the
 * previous visit; "since your last visit" deltas compare the current asks with it.
 */
export const FundingVisits = z.object({ seen: FundingSnapshot.nullable().default(null), baseline: FundingSnapshot.nullable().default(null) });
export type FundingVisits = z.infer<typeof FundingVisits>;

/** Private Ballot Prep draft: initiative id → tier. Initiatives not listed are Off. Never submitted. */
export const BallotDraft = z.object({ tiers: z.record(Id, z.enum(["S", "A", "B"])), updatedAt: When });
export type BallotDraft = z.infer<typeof BallotDraft>;

/**
 * "My affiliations": organizations the holder works with, advises or founded (free text), and
 * manual overrides per initiative id ("mine" marks it, "not_mine" dismisses an automatic match).
 * `suggested` is true while the entries came from the public-profile lookup and were not edited.
 */
export const Affiliations = z.object({
  entries: z.array(Text(160)).max(50).default([]),
  overrides: z.record(Id, z.enum(["mine", "not_mine"])).default({}),
  suggested: z.boolean().default(false),
});
export type Affiliations = z.infer<typeof Affiliations>;

/** "May interest you" inputs: focus chip ids ("cat:<slug>" or "mode:<id>") and free-text keywords. */
export const Interest = z.object({
  focus: z.array(Text(80)).max(40).default([]),
  keywords: z.array(Text(80)).max(30).default([]),
  suggested: z.boolean().default(false),
});
export type Interest = z.infer<typeof Interest>;

/** "Mark as asked or resolved" on dossier open questions, keyed by the stable question id. */
export const OpenQuestionMarks = z.record(Id, z.object({ markedAt: When })).refine((r) => Object.keys(r).length <= 5000, "Too many marked questions");
export type OpenQuestionMarks = z.infer<typeof OpenQuestionMarks>;

/** Sets or clears the local mark for one open question. */
export function setOpenQuestionMark(marks: OpenQuestionMarks, id: string, marked: boolean, now = new Date()): OpenQuestionMarks {
  const next = { ...marks };
  if (marked) next[id] = { markedAt: now.toISOString() };
  else delete next[id];
  return next;
}

/** Briefing items (Item 12) the holder marked as read: stable item id (`<initiative id>:<key>`) → when. Never sent anywhere. */
export const BriefingRead = z.record(Id, z.object({ readAt: When })).refine((r) => Object.keys(r).length <= 5000, "Too many read marks");
export type BriefingRead = z.infer<typeof BriefingRead>;

/** Sets or clears the local "Mark as read" state of one briefing item. */
export function setBriefingReadMark(marks: BriefingRead, id: string, read: boolean, now = new Date()): BriefingRead {
  const next = { ...marks };
  if (read) next[id] = { readAt: now.toISOString() };
  else delete next[id];
  return next;
}

export const WorkspaceSchema = z
  .object({
    version: z.literal(1),
    initiatives: z.array(SavedInitiative).max(200).default([]),
    searches: z.array(SavedSearch).max(50).default([]),
    bookmarks: z.array(Bookmark).max(500).default([]),
    comparisons: z.array(SavedComparison).max(100).default([]),
    notes: z.array(Note).max(500).default([]),
    questions: z.array(Question).max(500).default([]),
    priorities: z.array(ResearchPriority).max(100).default([]),
    assessments: z.array(Assessment).max(300).default([]),
    lastVisited: LastVisited.nullable().default(null),
    /** When the reviewer last marked the change log as reviewed. */
    lastReviewAt: When.nullable().default(null),
    funding: FundingVisits.default({ seen: null, baseline: null }),
    ballotDraft: BallotDraft.nullable().default(null),
    affiliations: Affiliations.default({ entries: [], overrides: {}, suggested: false }),
    interest: Interest.default({ focus: [], keywords: [], suggested: false }),
    /** Rule-based open questions the holder marked as asked or resolved: question id → when. Never sent anywhere. */
    openQuestions: OpenQuestionMarks.default({}),
    /** Briefing items marked as read (Item 12): item id → when. Included in exports with the rest of the workspace. */
    briefingRead: BriefingRead.default({}),
    /** Review state per initiative id (Not started, Reading, Reviewed, Revisit). Never sent anywhere. */
    progress: z.record(Id, ProgressMark).default({}),
    /** The published record as last seen in this browser; "Since your last visit" compares against `baseline`. */
    visit: VisitState.default({ seen: null, baseline: null }),
  })
  .passthrough();
export type Workspace = z.infer<typeof WorkspaceSchema>;

export const EMPTY_WORKSPACE: Workspace = WorkspaceSchema.parse({ version: 1 });

export const EXPORT_FORMAT = "ethsecurity-intelligence/workspace@1";

export function exportWorkspace(w: Workspace, now = new Date()) {
  return { format: EXPORT_FORMAT, exportedAt: now.toISOString(), note: "Private reviewer workspace. Created in a browser; never sent to the server.", workspace: w };
}

/** Accepts either an export file or a bare workspace object. */
export function parseImport(text: string): { ok: true; workspace: Workspace } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "The file is not valid JSON." };
  }
  const candidate = raw && typeof raw === "object" && "workspace" in raw ? (raw as { workspace: unknown }).workspace : raw;
  const parsed = WorkspaceSchema.safeParse(candidate);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return { ok: false, error: `The file is not a workspace export (${i ? `${i.path.join(".") || "root"}: ${i.message}` : "invalid"}).` };
  }
  return { ok: true, workspace: parsed.data };
}

export interface ChangeRef {
  id: string;
  at: string;
  kind: string;
  summary: string;
}

export function fingerprintFor(datasetVersion: string, changes: ChangeRef[]): Fingerprint {
  const latest = changes.reduce<string | null>((m, c) => (m === null || c.at > m ? c.at : m), null);
  return { datasetVersion, changeIds: changes.map((c) => c.id), latestChangeAt: latest };
}

export interface ExpirationAlert {
  assessmentId: string;
  initiativeId: string;
  newChanges: ChangeRef[];
}

/**
 * Decision expiration: an assessment is flagged when the change log now holds changes for its
 * initiative that were not present when the assessment was saved.
 */
export function expirationAlerts(w: Workspace, changesByInitiative: Record<string, ChangeRef[]>): ExpirationAlert[] {
  const out: ExpirationAlert[] = [];
  for (const a of w.assessments) {
    const known = new Set(a.fingerprint.changeIds);
    const fresh = (changesByInitiative[a.initiativeId] ?? []).filter((c) => !known.has(c.id));
    if (fresh.length) out.push({ assessmentId: a.id, initiativeId: a.initiativeId, newChanges: fresh.sort((x, y) => y.at.localeCompare(x.at)) });
  }
  return out;
}

export interface BookmarkAlert {
  bookmarkId: string;
  claimId: string;
  before: EvidenceStatus;
  after: EvidenceStatus | null;
}

/** Bookmarked evidence whose status changed, or which no longer exists in the published record. */
export function bookmarkAlerts(w: Workspace, currentStatus: Record<string, EvidenceStatus | null>): BookmarkAlert[] {
  return w.bookmarks
    .filter((b) => b.claimId in currentStatus && currentStatus[b.claimId] !== b.status)
    .map((b) => ({ bookmarkId: b.id, claimId: b.claimId, before: b.status, after: currentStatus[b.claimId] ?? null }));
}

/** A new visit starts when the previous page view is older than this. */
export const VISIT_GAP_MS = 30 * 60 * 1000;

/**
 * Records a page view of the current asks. On the first view ever, nothing is compared. When the
 * last view is older than VISIT_GAP_MS a new visit starts and the last seen snapshot becomes the
 * baseline; views within the same visit keep the baseline.
 */
export function recordFundingView(f: FundingVisits, current: { datasetVersion: string; asks: Record<string, number | null> }, now = new Date()): FundingVisits {
  const seen: FundingSnapshot = { datasetVersion: current.datasetVersion, at: now.toISOString(), asks: current.asks };
  if (!f.seen) return { seen, baseline: null };
  const gap = now.getTime() - Date.parse(f.seen.at);
  const newVisit = !Number.isFinite(gap) || gap > VISIT_GAP_MS;
  return { seen, baseline: newVisit ? f.seen : f.baseline };
}

export interface AskDelta {
  id: string;
  beforeCents: number;
  afterCents: number;
  /** after − before; negative means the ask went down. */
  deltaCents: number;
}

/** Initiatives whose ask differs from the baseline. Unavailable values and new initiatives are not compared. */
export function askDeltas(baseline: FundingSnapshot | null, asks: Record<string, number | null>): AskDelta[] {
  if (!baseline) return [];
  const out: AskDelta[] = [];
  for (const [id, after] of Object.entries(asks)) {
    const before = baseline.asks[id];
    if (typeof before === "number" && typeof after === "number" && before !== after) out.push({ id, beforeCents: before, afterCents: after, deltaCents: after - before });
  }
  return out;
}

/** Adds an affiliation entry (trimmed, case-insensitive duplicates ignored). Editing clears `suggested`. */
export function addAffiliationEntry(a: Affiliations, text: string): Affiliations {
  const t = text.trim().replace(/\s+/g, " ").slice(0, 160);
  if (!t || a.entries.some((e) => e.toLowerCase() === t.toLowerCase()) || a.entries.length >= 50) return a;
  return { ...a, entries: [...a.entries, t], suggested: false };
}

export function removeAffiliationEntry(a: Affiliations, text: string): Affiliations {
  return { ...a, entries: a.entries.filter((e) => e !== text), suggested: false };
}

/** Sets or clears (null) the manual override for one initiative. */
export function setAffiliationOverride(a: Affiliations, id: string, value: "mine" | "not_mine" | null): Affiliations {
  const overrides = { ...a.overrides };
  if (value) overrides[id] = value;
  else delete overrides[id];
  return { ...a, overrides };
}

export const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
