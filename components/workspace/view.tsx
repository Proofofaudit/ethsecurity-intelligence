"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AddPicker, selectClass, textareaClass } from "@/components/ui/form";
import { formatDate, formatDateTime } from "@/components/ui/money";
import { StatusMark } from "@/components/ui/status";
import type { EvidenceStatus } from "@/lib/domain/schemas";
import { cn } from "@/lib/util/cn";
import type { BallotView, CalendarView, FundingView } from "@/lib/vote/view-data";
import { BallotPrep } from "./ballot-prep";
import { askDeltas, bookmarkAlerts, expirationAlerts, exportWorkspace, fingerprintFor, parseImport, type ChangeRef, type Priority } from "./schema";
import { AskDeltaNote, useFundingBaseline } from "./since-visit";
import { VoteCalendar } from "./vote-calendar";
import {
  acknowledgeBookmark,
  addNote,
  addPriority,
  addQuestion,
  clearWorkspace,
  movePriority,
  reconfirmAssessment,
  removeAssessment,
  removeBookmark,
  removeComparison,
  removeNote,
  removePriority,
  removeQuestion,
  removeSearch,
  replaceWorkspace,
  saveAssessment,
  setPriority,
  setPriorityDone,
  setQuestionResolved,
  setReviewed,
  toggleSaved,
  updateNote,
  useWorkspace,
} from "./store";

interface Ini {
  id: string;
  slug: string;
  label: string;
  sub: string | null;
}

const PRIORITY_LABEL: Record<Priority, string> = { high: "High", medium: "Medium", low: "Low" };
const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

function Section({ id, title, count, note, children, action }: { id: string; title: string; count?: number; note?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-20 border-t border-ink pt-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={`${id}-h`} className="text-md font-semibold">
          {title} {count !== undefined && <span className="num text-sm font-normal text-ink-3">{count}</span>}
        </h2>
        {action}
      </div>
      {note && <p className="mb-3 text-xs text-ink-3">{note}</p>}
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-2 text-sm text-ink-3">{children}</p>;
}

const noop = () => () => {};
const linkBtn = "text-xs text-ink-3 hover:text-accent";

export interface WorkspaceVote {
  calendar: CalendarView;
  funding: FundingView;
  ballot: BallotView;
}

export function WorkspaceView({ initiatives, changes, datasetVersion, vote }: { initiatives: Ini[]; changes: Record<string, ChangeRef[]>; datasetVersion: string; vote: WorkspaceVote }) {
  const w = useWorkspace();
  const baseline = useFundingBaseline(vote.funding);
  const deltas = useMemo(() => new Map(askDeltas(baseline ?? null, vote.funding.asks).map((d) => [d.id, d])), [baseline, vote.funding.asks]);
  const hydrated = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  const [claimStatus, setClaimStatus] = useState<Record<string, EvidenceStatus | null>>({});
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const byId = useMemo(() => new Map(initiatives.map((i) => [i.id, i])), [initiatives]);
  const label = (id: string | null) => (id ? (byId.get(id)?.label ?? "Initiative no longer in the cohort") : "General");


  const bookmarkKey = w.bookmarks.map((b) => b.claimId).join(",");
  useEffect(() => {
    const ids = bookmarkKey ? bookmarkKey.split(",").slice(0, 60) : [];
    if (!ids.length) return;
    let live = true;
    Promise.all(
      ids.map((id) =>
        fetch(`/api/v1/claims/${encodeURIComponent(id)}`)
          .then(async (r) => (r.ok ? [id, ((await r.json()) as { data: { claim: { status: EvidenceStatus } } }).data.claim.status] : r.status === 404 ? [id, null] : null))
          .catch(() => null),
      ),
    ).then((pairs) => {
      if (!live) return;
      const out: Record<string, EvidenceStatus | null> = {};
      for (const p of pairs) if (p) out[p[0] as string] = p[1] as EvidenceStatus | null;
      setClaimStatus(out);
    });
    return () => {
      live = false;
    };
  }, [bookmarkKey]);

  const expired = expirationAlerts(w, changes);
  const expiredById = new Map(expired.map((a) => [a.assessmentId, a]));
  const bAlerts = bookmarkAlerts(w, claimStatus);
  const savedSorted = [...w.initiatives].sort((a, b) => (PRIORITY_ORDER[a.priority ?? ""] ?? 3) - (PRIORITY_ORDER[b.priority ?? ""] ?? 3) || label(a.id).localeCompare(label(b.id)));
  const reviewedCount = w.initiatives.filter((x) => x.reviewedAt).length;

  const doExport = () => {
    const blob = new Blob([JSON.stringify(exportWorkspace(w), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ethsecurity-workspace-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage({ tone: "ok", text: "Workspace exported as a JSON file." });
  };
  const doImport = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 2_000_000) return setMessage({ tone: "error", text: "The file is larger than 2 MB and was not imported." });
    const r = parseImport(await f.text());
    if (!r.ok) return setMessage({ tone: "error", text: r.error });
    if (!window.confirm("Replace the workspace in this browser with the imported file?")) return;
    replaceWorkspace(r.workspace);
    setMessage({ tone: "ok", text: "Workspace imported." });
  };

  if (!hydrated) return <p className="text-sm text-ink-3">Loading your workspace from this browser…</p>;

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-rule py-3">
        <p className="max-w-[720px] text-xs text-ink-2">No wallet, vote or personal voting choice is collected. Clearing this site&apos;s data in the browser deletes the workspace, so export it to keep a copy or to move it to another device.</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={doExport}>
            Export JSON
          </Button>
          <Button size="sm" onClick={() => fileRef.current?.click()}>
            Import JSON
          </Button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void doImport(e.target.files?.[0]).finally(() => (e.target.value = ""))} aria-label="Import a workspace JSON file" />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (window.confirm("Delete everything in this workspace? This cannot be undone unless you exported it.")) {
                clearWorkspace();
                setMessage({ tone: "ok", text: "Workspace cleared." });
              }
            }}
          >
            Clear
          </Button>
        </div>
      </div>
      {message && (
        <p role="status" className={cn("text-sm", message.tone === "error" ? "text-st-contradicted" : "text-st-verified")}>
          {message.text}
        </p>
      )}

      <VoteCalendar view={vote.calendar} />

      <div className="grid gap-x-10 gap-y-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <p className="eyebrow mb-1">Resume</p>
          {w.lastVisited ? (
            <p className="text-sm">
              <Link href={w.lastVisited.path} className="link">
                {w.lastVisited.title || w.lastVisited.path}
              </Link>{" "}
              <span className="text-xs text-ink-3">last visited {formatDateTime(w.lastVisited.at)}</span>
            </p>
          ) : (
            <p className="text-sm text-ink-3">Pages you visit are remembered here so you can pick up where you left off.</p>
          )}
        </div>
        <dl className="grid grid-cols-3 gap-4 text-sm sm:grid-cols-6">
          {[
            ["Saved", w.initiatives.length],
            ["Reviewed", reviewedCount],
            ["Bookmarks", w.bookmarks.length],
            ["Notes", w.notes.length],
            ["Open questions", w.questions.filter((q) => !q.resolvedAt).length],
            ["Assessments", w.assessments.length],
          ].map(([k, v]) => (
            <div key={k as string}>
              <dt className="text-xs text-ink-3">{k}</dt>
              <dd className="num text-lg">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      {(expired.length > 0 || bAlerts.length > 0) && (
        <section aria-labelledby="alerts-h" className="border-l-2 border-st-partial bg-st-partial-wash px-4 py-3">
          <h2 id="alerts-h" className="text-md font-semibold">
            Decision expiration alerts
          </h2>
          <p className="mt-1 text-xs text-ink-2">The published record changed after you saved these items. Review the changes and confirm or update your assessment.</p>
          <ul className="mt-2 space-y-2 text-sm">
            {expired.map((a) => {
              const as = w.assessments.find((x) => x.id === a.assessmentId);
              return (
                <li key={a.assessmentId}>
                  <a href={`#assessment-${a.assessmentId}`} className="font-medium hover:text-accent">
                    Assessment of {label(a.initiativeId)}
                  </a>{" "}
                  <span className="text-xs text-ink-2">
                    saved {as ? formatDate(as.savedAt) : ""}: {a.newChanges.length} new {a.newChanges.length === 1 ? "change" : "changes"}, latest &ldquo;{a.newChanges[0]?.summary}&rdquo;
                  </span>
                </li>
              );
            })}
            {bAlerts.map((b) => {
              const bm = w.bookmarks.find((x) => x.id === b.bookmarkId);
              return (
                <li key={b.bookmarkId} className="text-sm">
                  <a href="#bookmarks" className="font-medium hover:text-accent">
                    Bookmarked statement
                  </a>{" "}
                  <span className="text-xs text-ink-2">
                    &ldquo;{bm?.assertion.slice(0, 100)}&rdquo; {b.after ? "changed evidence status" : "is no longer in the published record"}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <Section
        id="saved"
        title="Saved initiatives"
        count={w.initiatives.length}
        note="Order: your own priority, then Alphabetical (neutral) within each priority. Changes are counted from the date you saved each initiative."
        action={
          w.initiatives.length >= 2 ? (
            <Link
              href={`/research/compare?ids=${savedSorted
                .slice(0, 5)
                .map((x) => byId.get(x.id)?.slug)
                .filter(Boolean)
                .join(",")}`}
              className={linkBtn}
            >
              Compare the first {Math.min(5, w.initiatives.length)}
            </Link>
          ) : undefined
        }
      >
        <div className="mb-3 max-w-[420px]">
          <AddPicker options={initiatives} selected={w.initiatives.map((x) => x.id)} max={200} onAdd={toggleSaved} placeholder="Save an initiative by name" label="Save an initiative" />
        </div>
        {w.initiatives.length === 0 ? (
          <Empty>
            Nothing saved yet. Use Save on any dossier or in{" "}
            <Link href="/research" className="link">
              Research
            </Link>
            .
          </Empty>
        ) : (
          <ul className="divide-y divide-rule border-y border-rule">
            {savedSorted.map((s) => {
              const ini = byId.get(s.id);
              const newer = (changes[s.id] ?? []).filter((c) => c.at > s.addedAt).length;
              return (
                <li key={s.id} className="grid items-center gap-x-4 gap-y-2 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
                  <div className="min-w-0">
                    {ini ? (
                      <Link href={`/initiatives/${ini.slug}`} className="font-medium hover:text-accent">
                        {ini.label}
                      </Link>
                    ) : (
                      <span className="text-ink-3">{label(s.id)}</span>
                    )}
                    <span className="block text-xs text-ink-3">
                      Saved {formatDate(s.addedAt)}
                      {newer > 0 && (
                        <>
                          {" · "}
                          <Link href={`/research/changes?ini=${ini?.slug}&since=${encodeURIComponent(s.addedAt)}`} className="text-st-partial hover:text-accent">
                            {newer} {newer === 1 ? "change" : "changes"} since
                          </Link>
                        </>
                      )}
                    </span>
                    <AskDeltaNote delta={deltas.get(s.id)} className="block text-xs text-ink-2" />
                  </div>
                  <label className="flex items-center gap-2 text-xs">
                    <span className="text-ink-3">Priority</span>
                    <select className={cn(selectClass, "h-7 w-24 text-xs")} value={s.priority ?? ""} onChange={(e) => setPriority(s.id, (e.target.value || null) as Priority | null)}>
                      <option value="">None</option>
                      {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
                        <option key={p} value={p}>
                          {PRIORITY_LABEL[p]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="button" onClick={() => setReviewed(s.id, !s.reviewedAt)} aria-pressed={!!s.reviewedAt} className={cn("h-7 rounded-sm border px-2 text-xs", s.reviewedAt ? "border-ink bg-ink text-paper" : "border-rule-2 text-ink-2 hover:border-ink-3")}>
                    {s.reviewedAt ? `Reviewed ${formatDate(s.reviewedAt)}` : "Mark reviewed"}
                  </button>
                  <button type="button" onClick={() => toggleSaved(s.id)} className={linkBtn}>
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <BallotPrep view={vote.ballot} datasetVersion={datasetVersion} deltas={deltas} />

      <Assessments initiatives={initiatives} changes={changes} datasetVersion={datasetVersion} expiredById={expiredById} label={label} />

      <div className="grid gap-10 lg:grid-cols-2 [&>*]:min-w-0">
        <NotesSection initiatives={initiatives} label={label} />
        <QuestionsSection initiatives={initiatives} label={label} />
      </div>

      <div className="grid gap-10 lg:grid-cols-2 [&>*]:min-w-0">
        <PrioritiesSection />
        <Section id="bookmarks" title="Bookmarked evidence" count={w.bookmarks.length} note="Bookmark any statement from its source inspector in a dossier. Its evidence status is compared with the current record.">
          {w.bookmarks.length === 0 ? (
            <Empty>No bookmarks yet.</Empty>
          ) : (
            <ul className="divide-y divide-rule">
              {w.bookmarks.map((b) => {
                const now = claimStatus[b.claimId];
                const changed = b.claimId in claimStatus && now !== b.status;
                const slug = byId.get(b.initiativeId)?.slug;
                return (
                  <li key={b.id} className="py-2 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <Link href={`/initiatives/${slug}#claim=${b.claimId}`} className="min-w-0 hover:text-accent">
                        {b.assertion}
                      </Link>
                      <button type="button" onClick={() => removeBookmark(b.id)} className={cn(linkBtn, "shrink-0")}>
                        Remove
                      </button>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
                      <span>{label(b.initiativeId)}</span>
                      <StatusMark status={b.status} />
                      {changed && (
                        <>
                          <span className="text-st-partial">{now ? "now" : "no longer published"}</span>
                          {now && <StatusMark status={now} />}
                          {now && (
                            <button type="button" onClick={() => acknowledgeBookmark(b.claimId, now)} className={linkBtn}>
                              Accept the new status
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>

      <div className="grid gap-10 lg:grid-cols-2 [&>*]:min-w-0">
        <Section id="comparisons" title="Saved comparisons" count={w.comparisons.length}>
          {w.comparisons.length === 0 ? (
            <Empty>
              Save a comparison from the{" "}
              <Link href="/research/compare" className="link">
                comparison view
              </Link>
              .
            </Empty>
          ) : (
            <ul className="divide-y divide-rule">
              {w.comparisons.map((c) => (
                <li key={c.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                  <Link href={`/research/compare?ids=${c.ids.join(",")}`} className="min-w-0 hover:text-accent">
                    {c.name}
                  </Link>
                  <span className="flex shrink-0 items-baseline gap-3">
                    <span className="text-xs text-ink-3">{formatDate(c.createdAt)}</span>
                    <button type="button" onClick={() => removeComparison(c.id)} className={linkBtn}>
                      Remove
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section id="searches" title="Saved searches" count={w.searches.length}>
          {w.searches.length === 0 ? (
            <Empty>
              Save a search from{" "}
              <Link href="/research" className="link">
                Research
              </Link>
              .
            </Empty>
          ) : (
            <ul className="divide-y divide-rule">
              {w.searches.map((s) => (
                <li key={s.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                  <Link href={`/research?${s.query}`} className="min-w-0 hover:text-accent">
                    {s.name}
                  </Link>
                  <span className="flex shrink-0 items-baseline gap-3">
                    <span className="text-xs text-ink-3">{formatDate(s.createdAt)}</span>
                    <button type="button" onClick={() => removeSearch(s.id)} className={linkBtn}>
                      Remove
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}

function IniSelect({ initiatives, value, onChange, allowGeneral }: { initiatives: Ini[]; value: string; onChange: (v: string) => void; allowGeneral?: boolean }) {
  return (
    <select className={selectClass} value={value} onChange={(e) => onChange(e.target.value)} aria-label="Initiative">
      {allowGeneral ? <option value="">General (no initiative)</option> : <option value="">Choose an initiative</option>}
      {initiatives.map((i) => (
        <option key={i.id} value={i.id}>
          {i.label}
        </option>
      ))}
    </select>
  );
}

function Assessments({ initiatives, changes, datasetVersion, expiredById, label }: { initiatives: Ini[]; changes: Record<string, ChangeRef[]>; datasetVersion: string; expiredById: Map<string, { newChanges: ChangeRef[] }>; label: (id: string | null) => string }) {
  const w = useWorkspace();
  const [ini, setIni] = useState("");
  const [text, setText] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!ini || !text.trim()) return;
    saveAssessment(ini, text.trim(), fingerprintFor(datasetVersion, changes[ini] ?? []));
    setText("");
  };
  return (
    <Section id="assessments" title="Assessments" count={w.assessments.length} note="Your own conclusions. Each one records which changes existed when you wrote it; a later change to that initiative raises a decision expiration alert.">
      <form onSubmit={submit} className="mb-4 grid gap-2 md:grid-cols-[260px_minmax(0,1fr)_auto] md:items-start">
        <IniSelect initiatives={initiatives} value={ini} onChange={setIni} />
        <textarea className={textareaClass} rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Your assessment, in your own words" aria-label="Assessment text" maxLength={5000} />
        <Button type="submit" size="sm" disabled={!ini || !text.trim()}>
          Save assessment
        </Button>
      </form>
      {w.assessments.length === 0 ? (
        <Empty>No assessments yet.</Empty>
      ) : (
        <ul className="divide-y divide-rule">
          {w.assessments.map((a) => {
            const exp = expiredById.get(a.id);
            return (
              <li key={a.id} id={`assessment-${a.id}`} className="scroll-mt-20 py-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{label(a.initiativeId)}</span>
                  <span className="text-xs text-ink-3">Saved {formatDateTime(a.savedAt)}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-ink-2">{a.text}</p>
                {exp ? (
                  <div className="mt-2 border-l-2 border-st-partial pl-3 text-xs">
                    <p className="font-medium text-st-partial">
                      {exp.newChanges.length} {exp.newChanges.length === 1 ? "change" : "changes"} since you wrote this
                    </p>
                    <ul className="mt-1 space-y-0.5 text-ink-2">
                      {exp.newChanges.slice(0, 5).map((c) => (
                        <li key={c.id}>
                          <span className="num text-ink-3">{formatDate(c.at)}</span> {c.summary}
                        </li>
                      ))}
                    </ul>
                    <button type="button" onClick={() => reconfirmAssessment(a.id, fingerprintFor(datasetVersion, changes[a.initiativeId] ?? []))} className="mt-1 text-ink-3 underline-offset-4 hover:text-accent hover:underline">
                      I reviewed the changes; the assessment still holds
                    </button>
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-st-verified">No change recorded since you wrote this.</p>
                )}
                <button type="button" onClick={() => removeAssessment(a.id)} className={cn(linkBtn, "mt-1")}>
                  Delete
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

function NotesSection({ initiatives, label }: { initiatives: Ini[]; label: (id: string | null) => string }) {
  const w = useWorkspace();
  const [ini, setIni] = useState("");
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  return (
    <Section id="notes" title="Private notes" count={w.notes.length}>
      <form
        className="mb-3 space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          addNote(ini || null, text.trim());
          setText("");
        }}
      >
        <IniSelect initiatives={initiatives} value={ini} onChange={setIni} allowGeneral />
        <textarea className={textareaClass} rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="A private note" aria-label="Note text" maxLength={5000} />
        <Button type="submit" size="sm" disabled={!text.trim()}>
          Add note
        </Button>
      </form>
      {w.notes.length === 0 ? (
        <Empty>No notes yet.</Empty>
      ) : (
        <ul className="divide-y divide-rule">
          {w.notes.map((n) => (
            <li key={n.id} className="py-2 text-sm">
              <p className="text-xs text-ink-3">
                {label(n.initiativeId)} · {formatDateTime(n.updatedAt)}
              </p>
              {editing?.id === n.id ? (
                <div className="mt-1 space-y-1.5">
                  <textarea className={textareaClass} rows={3} value={editing.text} onChange={(e) => setEditing({ id: n.id, text: e.target.value })} aria-label="Edit note" maxLength={5000} />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        updateNote(n.id, editing.text);
                        setEditing(null);
                      }}
                    >
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="mt-0.5 whitespace-pre-wrap text-ink-2">{n.text}</p>
                  <p className="mt-1 flex gap-3">
                    <button type="button" onClick={() => setEditing({ id: n.id, text: n.text })} className={linkBtn}>
                      Edit
                    </button>
                    <button type="button" onClick={() => removeNote(n.id)} className={linkBtn}>
                      Delete
                    </button>
                  </p>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function QuestionsSection({ initiatives, label }: { initiatives: Ini[]; label: (id: string | null) => string }) {
  const w = useWorkspace();
  const [ini, setIni] = useState("");
  const [text, setText] = useState("");
  const open = w.questions.filter((q) => !q.resolvedAt);
  const done = w.questions.filter((q) => q.resolvedAt);
  return (
    <Section
      id="questions"
      title="Unresolved questions"
      count={open.length}
      note={
        <>
          Questions you want answered. The{" "}
          <Link href="/research/blind-spots" className="link">
            blind spots
          </Link>{" "}
          view suggests specific ones.
        </>
      }
    >
      <form
        className="mb-3 space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          addQuestion(ini || null, text.trim());
          setText("");
        }}
      >
        <IniSelect initiatives={initiatives} value={ini} onChange={setIni} allowGeneral />
        <textarea className={textareaClass} rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="A question to investigate" aria-label="Question text" maxLength={1000} />
        <Button type="submit" size="sm" disabled={!text.trim()}>
          Add question
        </Button>
      </form>
      {w.questions.length === 0 ? (
        <Empty>No questions recorded.</Empty>
      ) : (
        <ul className="divide-y divide-rule">
          {[...open, ...done].map((q) => (
            <li key={q.id} className="flex items-start gap-2 py-2 text-sm">
              <input type="checkbox" checked={!!q.resolvedAt} onChange={(e) => setQuestionResolved(q.id, e.target.checked)} className="mt-1 size-3.5 accent-[var(--accent)]" aria-label={q.resolvedAt ? "Mark as unresolved" : "Mark as resolved"} />
              <div className="min-w-0 flex-1">
                <p className={cn(q.resolvedAt ? "text-ink-3 line-through" : "text-ink")}>{q.text}</p>
                <p className="text-xs text-ink-3">
                  {label(q.initiativeId)} · {q.resolvedAt ? `resolved ${formatDate(q.resolvedAt)}` : `added ${formatDate(q.createdAt)}`}
                </p>
              </div>
              <button type="button" onClick={() => removeQuestion(q.id)} className={cn(linkBtn, "shrink-0")}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function PrioritiesSection() {
  const w = useWorkspace();
  const [text, setText] = useState("");
  return (
    <Section id="priorities" title="Research priorities" count={w.priorities.filter((p) => !p.done).length} note="What you want to look into first, in your order.">
      <form
        className="mb-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          addPriority(text.trim());
          setText("");
        }}
      >
        <input className="h-8 min-w-0 flex-1 rounded-xs border border-rule-2 bg-paper px-2 text-sm focus:border-ink focus:outline-none" value={text} onChange={(e) => setText(e.target.value)} placeholder="For example: check adoption commitments for wallets" aria-label="New research priority" maxLength={500} />
        <Button type="submit" size="sm" disabled={!text.trim()}>
          Add
        </Button>
      </form>
      {w.priorities.length === 0 ? (
        <Empty>No priorities defined.</Empty>
      ) : (
        <ol className="divide-y divide-rule">
          {w.priorities.map((p, i) => (
            <li key={p.id} className="flex items-center gap-2 py-1.5 text-sm">
              <span className="num w-5 text-xs text-ink-3">{i + 1}</span>
              <input type="checkbox" checked={p.done} onChange={(e) => setPriorityDone(p.id, e.target.checked)} className="size-3.5 accent-[var(--accent)]" aria-label={p.done ? "Mark as not done" : "Mark as done"} />
              <span className={cn("min-w-0 flex-1", p.done && "text-ink-3 line-through")}>{p.text}</span>
              <button type="button" onClick={() => movePriority(p.id, -1)} disabled={i === 0} className="px-1 text-ink-3 hover:text-accent disabled:opacity-30" aria-label="Move up">
                ↑
              </button>
              <button type="button" onClick={() => movePriority(p.id, 1)} disabled={i === w.priorities.length - 1} className="px-1 text-ink-3 hover:text-accent disabled:opacity-30" aria-label="Move down">
                ↓
              </button>
              <button type="button" onClick={() => removePriority(p.id)} className={linkBtn}>
                Delete
              </button>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}
