/**
 * Private workspace data model (pure, no browser APIs, so it is unit-testable).
 * Version 1 is extended additively: every field added after the first release has a default,
 * so workspaces saved by earlier builds still parse.
 */
import { z } from "zod";
import { EvidenceStatus } from "@/lib/domain/schemas";

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

export const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
