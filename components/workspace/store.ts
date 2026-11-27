"use client";

/**
 * Private, local-first workspace kept in localStorage (never sent to the server).
 * Versioned and validated with zod (see ./schema); unknown fields are preserved.
 */
import { useSyncExternalStore } from "react";
import type { EvidenceStatus } from "@/lib/domain/schemas";
import { addAffiliationEntry, EMPTY_WORKSPACE, newId, recordFundingView, removeAffiliationEntry, setAffiliationOverride, setOpenQuestionMark, WorkspaceSchema, type Fingerprint, type Priority, type Workspace } from "./schema";
import type { Tier } from "@/lib/vote/ballot-rules";
import { applyRevisits, recordVisit, seenFromEntry, snapshotFromFeed, type ProgressState, type VisitFeedEntry } from "@/lib/workspace/progress";

export { WorkspaceSchema, type SavedSearch, type Workspace } from "./schema";

export const WORKSPACE_KEY = "esi.workspace";

const listeners = new Set<() => void>();
let cache: { raw: string | null; value: Workspace } | null = null;

function read(): Workspace {
  if (typeof window === "undefined") return EMPTY_WORKSPACE;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(WORKSPACE_KEY);
  } catch {
    return EMPTY_WORKSPACE;
  }
  if (cache && cache.raw === raw) return cache.value;
  let value = EMPTY_WORKSPACE;
  if (raw) {
    try {
      const parsed = WorkspaceSchema.safeParse(JSON.parse(raw));
      if (parsed.success) value = parsed.data;
    } catch {
      value = EMPTY_WORKSPACE;
    }
  }
  cache = { raw, value };
  return value;
}

export function updateWorkspace(fn: (w: Workspace) => Workspace) {
  const next = WorkspaceSchema.parse(fn(read()));
  try {
    window.localStorage.setItem(WORKSPACE_KEY, JSON.stringify(next));
  } catch {
    /* storage full or disabled: keep the in-memory state */
  }
  cache = null;
  listeners.forEach((l) => l());
}

export function replaceWorkspace(w: Workspace) {
  updateWorkspace(() => w);
}

export function clearWorkspace() {
  updateWorkspace(() => EMPTY_WORKSPACE);
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => e.key === WORKSPACE_KEY && l();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

export function useWorkspace(): Workspace {
  return useSyncExternalStore(subscribe, read, () => EMPTY_WORKSPACE);
}

const now = () => new Date().toISOString();

export function toggleSaved(id: string) {
  updateWorkspace((w) =>
    w.initiatives.some((x) => x.id === id)
      ? { ...w, initiatives: w.initiatives.filter((x) => x.id !== id) }
      : { ...w, initiatives: [...w.initiatives, { id, addedAt: now(), reviewedAt: null, priority: null }] },
  );
}

/**
 * Sets the review state of one initiative. Reviewed also sets reviewedAt on a saved initiative and
 * remembers the record seen at that moment (`seen`), so a later change can turn it into Revisit.
 * Not started removes the mark and clears reviewedAt.
 */
export function setProgressState(id: string, state: ProgressState, entry?: VisitFeedEntry) {
  updateWorkspace((w) => {
    const progress = { ...w.progress };
    if (state === "not_started") delete progress[id];
    else progress[id] = { state, at: now(), reason: null, seen: state === "reviewed" ? (entry ? seenFromEntry(entry) : (w.progress[id]?.seen ?? null)) : null };
    const reviewedAt = state === "reviewed" || state === "revisit" ? now() : null;
    return { ...w, progress, initiatives: w.initiatives.map((x) => (x.id === id ? { ...x, reviewedAt: state === "revisit" ? (x.reviewedAt ?? reviewedAt) : reviewedAt } : x)) };
  });
}

/** Marks an initiative reviewed (saving it if needed) or clears the mark. */
export function setReviewed(id: string, reviewed: boolean, entry?: VisitFeedEntry) {
  updateWorkspace((w) => {
    const has = w.initiatives.some((x) => x.id === id);
    const list = has ? w.initiatives : [...w.initiatives, { id, addedAt: now(), reviewedAt: null, priority: null }];
    const progress = { ...w.progress };
    if (reviewed) progress[id] = { state: "reviewed", at: now(), reason: null, seen: entry ? seenFromEntry(entry) : (w.progress[id]?.seen ?? null) };
    else delete progress[id];
    return { ...w, progress, initiatives: list.map((x) => (x.id === id ? { ...x, reviewedAt: reviewed ? now() : null } : x)) };
  });
}

/**
 * Stores this page view of the published record (no network) and turns Reviewed initiatives with
 * real changes into Revisit. Writes nothing when neither the record nor any mark changed.
 */
export function applyVisitFeed(feed: VisitFeedEntry[], datasetVersion: string) {
  const current = read();
  const visit = recordVisit(current.visit, snapshotFromFeed(feed, datasetVersion));
  const progress = applyRevisits(current.progress, feed);
  if (visit === current.visit && progress === current.progress) return;
  updateWorkspace((w) => ({ ...w, visit, progress: applyRevisits(w.progress, feed) }));
}

/** Removes every localStorage key this site owns (all keys starting with "esi.") and resets the in-memory state. */
export function clearAllMyData() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith("esi.")) keys.push(k);
    }
    for (const k of keys) window.localStorage.removeItem(k);
  } catch {
    /* storage disabled: nothing to remove */
  }
  cache = null;
  listeners.forEach((l) => l());
}

export function setPriority(id: string, priority: Priority | null) {
  updateWorkspace((w) => ({ ...w, initiatives: w.initiatives.map((x) => (x.id === id ? { ...x, priority } : x)) }));
}

export function saveSearch(name: string, query: string) {
  updateWorkspace((w) => ({ ...w, searches: [{ id: newId("s"), name: name.slice(0, 120), query, createdAt: now() }, ...w.searches].slice(0, 50) }));
}

export function removeSearch(id: string) {
  updateWorkspace((w) => ({ ...w, searches: w.searches.filter((s) => s.id !== id) }));
}

export function toggleBookmark(b: { claimId: string; initiativeId: string; assertion: string; status: EvidenceStatus }) {
  updateWorkspace((w) =>
    w.bookmarks.some((x) => x.claimId === b.claimId)
      ? { ...w, bookmarks: w.bookmarks.filter((x) => x.claimId !== b.claimId) }
      : { ...w, bookmarks: [{ id: newId("b"), ...b, assertion: b.assertion.slice(0, 400), savedAt: now() }, ...w.bookmarks] },
  );
}

/** Accepts the current status after the reviewer has inspected a changed bookmark. */
export function acknowledgeBookmark(claimId: string, status: EvidenceStatus) {
  updateWorkspace((w) => ({ ...w, bookmarks: w.bookmarks.map((b) => (b.claimId === claimId ? { ...b, status, savedAt: now() } : b)) }));
}

export function removeBookmark(id: string) {
  updateWorkspace((w) => ({ ...w, bookmarks: w.bookmarks.filter((b) => b.id !== id) }));
}

export function saveComparison(name: string, ids: string[]) {
  updateWorkspace((w) => ({ ...w, comparisons: [{ id: newId("c"), name: name.slice(0, 160), ids: ids.slice(0, 5), createdAt: now() }, ...w.comparisons].slice(0, 100) }));
}

export function removeComparison(id: string) {
  updateWorkspace((w) => ({ ...w, comparisons: w.comparisons.filter((c) => c.id !== id) }));
}

export function addNote(initiativeId: string | null, text: string) {
  const t = now();
  updateWorkspace((w) => ({ ...w, notes: [{ id: newId("n"), initiativeId, text: text.slice(0, 5000), createdAt: t, updatedAt: t }, ...w.notes] }));
}

export function updateNote(id: string, text: string) {
  updateWorkspace((w) => ({ ...w, notes: w.notes.map((n) => (n.id === id ? { ...n, text: text.slice(0, 5000), updatedAt: now() } : n)) }));
}

export function removeNote(id: string) {
  updateWorkspace((w) => ({ ...w, notes: w.notes.filter((n) => n.id !== id) }));
}

export function addQuestion(initiativeId: string | null, text: string) {
  updateWorkspace((w) => ({ ...w, questions: [{ id: newId("q"), initiativeId, text: text.slice(0, 1000), createdAt: now(), resolvedAt: null }, ...w.questions] }));
}

export function setQuestionResolved(id: string, resolved: boolean) {
  updateWorkspace((w) => ({ ...w, questions: w.questions.map((q) => (q.id === id ? { ...q, resolvedAt: resolved ? now() : null } : q)) }));
}

export function removeQuestion(id: string) {
  updateWorkspace((w) => ({ ...w, questions: w.questions.filter((q) => q.id !== id) }));
}

export function addPriority(text: string) {
  updateWorkspace((w) => ({ ...w, priorities: [...w.priorities, { id: newId("p"), text: text.slice(0, 500), createdAt: now(), done: false }] }));
}

export function setPriorityDone(id: string, done: boolean) {
  updateWorkspace((w) => ({ ...w, priorities: w.priorities.map((p) => (p.id === id ? { ...p, done } : p)) }));
}

export function movePriority(id: string, dir: -1 | 1) {
  updateWorkspace((w) => {
    const i = w.priorities.findIndex((p) => p.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= w.priorities.length) return w;
    const list = [...w.priorities];
    [list[i], list[j]] = [list[j]!, list[i]!];
    return { ...w, priorities: list };
  });
}

export function removePriority(id: string) {
  updateWorkspace((w) => ({ ...w, priorities: w.priorities.filter((p) => p.id !== id) }));
}

export function saveAssessment(initiativeId: string, text: string, fingerprint: Fingerprint) {
  updateWorkspace((w) => ({ ...w, assessments: [{ id: newId("a"), initiativeId, text: text.slice(0, 5000), savedAt: now(), fingerprint }, ...w.assessments] }));
}

/** Re-confirms an assessment against the current record (clears its expiration alert). */
export function reconfirmAssessment(id: string, fingerprint: Fingerprint) {
  updateWorkspace((w) => ({ ...w, assessments: w.assessments.map((a) => (a.id === id ? { ...a, savedAt: now(), fingerprint } : a)) }));
}

export function removeAssessment(id: string) {
  updateWorkspace((w) => ({ ...w, assessments: w.assessments.filter((a) => a.id !== id) }));
}

export function setLastVisited(path: string, title: string) {
  updateWorkspace((w) => (w.lastVisited?.path === path ? w : { ...w, lastVisited: { path: path.slice(0, 500), title: title.slice(0, 300), at: now() } }));
}

export function markChangesReviewed() {
  updateWorkspace((w) => ({ ...w, lastReviewAt: now() }));
}

/** Stores the asks shown on this page view (see recordFundingView). Local only; nothing is sent. */
export function recordFundingVisit(datasetVersion: string, asks: Record<string, number | null>) {
  updateWorkspace((w) => ({ ...w, funding: recordFundingView(w.funding, { datasetVersion, asks }) }));
}

/** Places an initiative in a Ballot Prep tier, or takes it Off the draft (tier null). */
export function setBallotTier(id: string, tier: Tier | null) {
  updateWorkspace((w) => {
    const tiers = { ...(w.ballotDraft?.tiers ?? {}) };
    if (tier) tiers[id] = tier;
    else delete tiers[id];
    return { ...w, ballotDraft: { tiers, updatedAt: now() } };
  });
}

export function clearBallotDraft() {
  updateWorkspace((w) => ({ ...w, ballotDraft: null }));
}

export function addAffiliation(text: string) {
  updateWorkspace((w) => ({ ...w, affiliations: addAffiliationEntry(w.affiliations, text) }));
}

export function removeAffiliation(text: string) {
  updateWorkspace((w) => ({ ...w, affiliations: removeAffiliationEntry(w.affiliations, text) }));
}

export function setAffiliationMark(id: string, value: "mine" | "not_mine" | null) {
  updateWorkspace((w) => ({ ...w, affiliations: setAffiliationOverride(w.affiliations, id, value) }));
}

/** Pre-fill from the public-profile lookup; the holder can edit everything afterwards. */
export function applyPublicSuggestion(organizations: string[], expertise: string[]) {
  updateWorkspace((w) => {
    let a = w.affiliations;
    for (const o of organizations) a = addAffiliationEntry(a, o);
    const keywords = [...w.interest.keywords];
    for (const e of expertise) if (e.trim() && !keywords.some((k) => k.toLowerCase() === e.trim().toLowerCase())) keywords.push(e.trim().slice(0, 80));
    return { ...w, affiliations: { ...a, suggested: true }, interest: { ...w.interest, keywords: keywords.slice(0, 30), suggested: true } };
  });
}

/** "Mark as asked or resolved" for one open question. Local only; the app never sends questions anywhere. */
export function markOpenQuestion(id: string, marked: boolean) {
  updateWorkspace((w) => ({ ...w, openQuestions: setOpenQuestionMark(w.openQuestions, id, marked) }));
}

export function toggleFocus(id: string) {
  updateWorkspace((w) => ({ ...w, interest: { ...w.interest, focus: w.interest.focus.includes(id) ? w.interest.focus.filter((f) => f !== id) : [...w.interest.focus, id].slice(0, 40) } }));
}

export function addInterestKeyword(text: string) {
  const t = text.trim().replace(/\s+/g, " ").slice(0, 80);
  updateWorkspace((w) => (!t || w.interest.keywords.some((k) => k.toLowerCase() === t.toLowerCase()) ? w : { ...w, interest: { ...w.interest, keywords: [...w.interest.keywords, t].slice(0, 30), suggested: false } }));
}

export function removeInterestKeyword(text: string) {
  updateWorkspace((w) => ({ ...w, interest: { ...w.interest, keywords: w.interest.keywords.filter((k) => k !== text), suggested: false } }));
}
