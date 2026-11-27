"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { selectClass } from "@/components/ui/form";
import { formatDateTime } from "@/components/ui/money";
import { cn } from "@/lib/util/cn";
import { workspaceToCsv, workspaceToJson, workspaceToMarkdown, type ExportContext } from "@/lib/workspace/export";
import { counterText, countStates, detectChanges, filterByState, PROGRESS_LABEL, PROGRESS_STATES, type ProgressState, type VisitFeedEntry } from "@/lib/workspace/progress";
import { parseImport, type Workspace } from "./schema";
import { applyVisitFeed, clearAllMyData, replaceWorkspace, setProgressState, useWorkspace } from "./store";

export interface ReviewIni {
  id: string;
  slug: string;
  label: string;
}

export function progressStateOf(w: Workspace, id: string): ProgressState {
  return w.progress[id]?.state ?? (w.initiatives.find((x) => x.id === id)?.reviewedAt ? "reviewed" : "not_started");
}

/** Stores this page view of the published record in this browser. Never sends anything. */
function useVisitFeed(feed: VisitFeedEntry[], datasetVersion: string) {
  useEffect(() => {
    applyVisitFeed(feed, datasetVersion);
  }, [feed, datasetVersion]);
}

function SinceList({ initiatives, feed, w }: { initiatives: ReviewIni[]; feed: VisitFeedEntry[]; w: Workspace }) {
  const byId = useMemo(() => new Map(initiatives.map((i) => [i.id, i])), [initiatives]);
  const baseline = w.visit.baseline;
  const deltas = useMemo(
    () => detectChanges(baseline, feed).sort((a, b) => (byId.get(a.id)?.label ?? "").localeCompare(byId.get(b.id)?.label ?? "", "en")),
    [baseline, feed, byId],
  );
  return (
    <div data-since-changes>
      <h3 className="text-sm font-semibold">Since your last visit</h3>
      {!baseline ? (
        <p className="mt-1 text-sm text-ink-3">This is your first visit recorded in this browser. Changes to the published record will be listed here next time.</p>
      ) : deltas.length === 0 ? (
        <p className="mt-1 text-sm text-ink-2" data-no-changes>
          Nothing in the published record has changed since your last visit ({formatDateTime(baseline.at)}).
        </p>
      ) : (
        <>
          <p className="mt-1 text-xs text-ink-3">
            <span className="num">{deltas.length}</span> {deltas.length === 1 ? "initiative" : "initiatives"} changed since {formatDateTime(baseline.at)}. Alphabetical (neutral).
          </p>
          <ul className="mt-2 divide-y divide-rule border-y border-rule">
            {deltas.map((d) => {
              const ini = byId.get(d.id);
              return (
                <li key={d.id} className="py-1.5 text-sm">
                  {ini ? (
                    <Link href={`/initiatives/${ini.slug}`} className="font-medium hover:text-accent">
                      {ini.label}
                    </Link>
                  ) : (
                    <span>{d.id}</span>
                  )}
                  <span className="block text-xs text-ink-2">{d.reasons.join("; ")}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

/** Compact version for Overview: counter, state counts and the since-last-visit list. */
export function ReviewProgressCompact({ initiatives, feed, datasetVersion }: { initiatives: ReviewIni[]; feed: VisitFeedEntry[]; datasetVersion: string }) {
  const w = useWorkspace();
  useVisitFeed(feed, datasetVersion);
  const ids = initiatives.map((i) => i.id);
  const counts = countStates(ids, (id) => progressStateOf(w, id));
  return (
    <section aria-labelledby="review-progress-h" data-review-progress className="border-t border-ink pt-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="review-progress-h" className="text-md font-semibold">
          Review progress
        </h2>
        <Link href="/workspace#review-progress" className="text-xs text-ink-3 hover:text-accent">
          Open in My Workspace
        </Link>
      </div>
      <p className="num text-sm" data-review-counter>
        {counterText(counts.reviewed, ids.length)}
      </p>
      <p className="mt-1 text-xs text-ink-3">
        {PROGRESS_STATES.map((s) => `${PROGRESS_LABEL[s]} ${counts[s]}`).join(" · ")}. Kept in this browser only.
      </p>
      <div className="mt-3">
        <SinceList initiatives={initiatives} feed={feed} w={w} />
      </div>
    </section>
  );
}

function download(name: string, type: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function ReviewProgress({ initiatives, feed, datasetVersion, exportContext }: { initiatives: ReviewIni[]; feed: VisitFeedEntry[]; datasetVersion: string; exportContext: ExportContext }) {
  const w = useWorkspace();
  useVisitFeed(feed, datasetVersion);
  const [filter, setFilter] = useState<ProgressState | "all">("all");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const feedById = useMemo(() => new Map(feed.map((e) => [e.id, e])), [feed]);
  const stateOf = (id: string) => progressStateOf(w, id);
  const counts = countStates(
    initiatives.map((i) => i.id),
    stateOf,
  );
  const shown = filterByState(initiatives, stateOf, filter);
  const stamp = new Date().toISOString().slice(0, 10);

  const doExport = (kind: "md" | "csv" | "json") => {
    if (kind === "md") download(`ethsecurity-review-progress-${stamp}.md`, "text/markdown", workspaceToMarkdown(w, exportContext));
    else if (kind === "csv") download(`ethsecurity-review-progress-${stamp}.csv`, "text/csv", workspaceToCsv(w, exportContext));
    else download(`ethsecurity-review-progress-${stamp}.json`, "application/json", workspaceToJson(w, exportContext));
    setMessage({ tone: "ok", text: `Exported as ${kind === "md" ? "Markdown" : kind.toUpperCase()}. The file was created in this browser.` });
  };
  const doImport = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 2_000_000) return setMessage({ tone: "error", text: "The file is larger than 2 MB and was not imported." });
    const r = parseImport(await f.text());
    if (!r.ok) return setMessage({ tone: "error", text: r.error });
    if (!window.confirm("Replace the workspace in this browser with the imported file?")) return;
    replaceWorkspace(r.workspace);
    setMessage({ tone: "ok", text: "Imported from the export file." });
  };

  return (
    <section id="review-progress" aria-labelledby="review-progress-h" data-review-progress className="scroll-mt-20 border-t border-ink pt-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="review-progress-h" className="text-md font-semibold">
          Review progress
        </h2>
        <p className="num text-sm" data-review-counter>
          {counterText(counts.reviewed, initiatives.length)}
        </p>
      </div>
      <p className="mb-3 text-xs text-ink-3">Mark each initiative Not started, Reading, Reviewed or Revisit. A Reviewed initiative becomes Revisit when the published record changes, and the reason names the change. Everything stays in this browser.</p>

      <div className="mb-4">
        <SinceList initiatives={initiatives} feed={feed} w={w} />
      </div>

      <div role="group" aria-label="Filter by review state" className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {(["all", ...PROGRESS_STATES] as const).map((s) => (
          <button key={s} type="button" aria-pressed={filter === s} onClick={() => setFilter(s)} className={cn("num border-b pb-0.5", filter === s ? "border-accent text-ink" : "border-transparent text-ink-3 hover:text-accent")}>
            {s === "all" ? `All ${initiatives.length}` : `${PROGRESS_LABEL[s]} ${counts[s]}`}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="py-2 text-sm text-ink-3">No initiatives in this state.</p>
      ) : (
        <ul className="max-h-[420px] divide-y divide-rule overflow-y-auto border-y border-rule">
          {shown.map((i) => {
            const s = stateOf(i.id);
            return (
              <li key={i.id} className="grid items-center gap-x-4 gap-y-1 py-1.5 text-sm sm:grid-cols-[minmax(0,1fr)_auto]">
                <div className="min-w-0">
                  <Link href={`/initiatives/${i.slug}`} className="font-medium hover:text-accent">
                    {i.label}
                  </Link>
                  {s === "revisit" && w.progress[i.id]?.reason && (
                    <span className="block text-xs text-ink-2" data-revisit-reason>
                      Revisit: {w.progress[i.id]?.reason}
                    </span>
                  )}
                </div>
                <select aria-label={`Review state for ${i.label}`} className={cn(selectClass, "h-7 w-32 text-xs")} value={s} onChange={(e) => setProgressState(i.id, e.target.value as ProgressState, feedById.get(i.id))}>
                  {PROGRESS_STATES.map((p) => (
                    <option key={p} value={p}>
                      {PROGRESS_LABEL[p]}
                    </option>
                  ))}
                </select>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-y border-rule py-3">
        <Button size="sm" onClick={() => doExport("md")}>
          Export Markdown
        </Button>
        <Button size="sm" onClick={() => doExport("csv")}>
          Export CSV
        </Button>
        <Button size="sm" onClick={() => doExport("json")}>
          Export JSON
        </Button>
        <Button size="sm" onClick={() => fileRef.current?.click()}>
          Import from export
        </Button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void doImport(e.target.files?.[0]).finally(() => (e.target.value = ""))} aria-label="Import a workspace export file" />
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            if (window.confirm("Delete everything this site stores in this browser (workspace, AI Lab templates and theme)? This cannot be undone unless you exported it.")) {
              clearAllMyData();
              setMessage({ tone: "ok", text: "All your data in this browser was cleared." });
            }
          }}
        >
          Clear all my data
        </Button>
      </div>
      <p className="mt-2 text-2xs text-ink-3">
        Exports include the dataset timestamp ({formatDateTime(exportContext.dataAsOf)}), source URLs, open questions with your asked or resolved marks, and evidence links. Files are created in this browser and are never uploaded.
      </p>
      {message && (
        <p role="status" className={cn("mt-2 text-sm", message.tone === "error" ? "text-st-contradicted" : "text-st-verified")}>
          {message.text}
        </p>
      )}
    </section>
  );
}
