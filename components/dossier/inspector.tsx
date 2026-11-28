"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { Claim, Evidence } from "@/lib/domain/schemas";
import { EVIDENCE_STATUS_LABEL } from "@/lib/domain/schemas";
import { Button, ExternalLink } from "@/components/ui/button";
import { Dialog, Sheet } from "@/components/ui/overlay";
import { formatDate, formatDateTime } from "@/components/ui/money";
import { StatusMark } from "@/components/ui/status";
import { toggleBookmark, useWorkspace } from "@/components/workspace/store";
import { EVIDENCE_KIND_LABEL } from "@/lib/dossier/labels";
import { correctionsStoreNotice } from "@/lib/corrections/store-status";
import { cn } from "@/lib/util/cn";

export const ORIGIN_LABEL: Record<Claim["origin"], string> = {
  official: "Official record (TheDAO Security Fund API)",
  external: "Observed by the research pipeline",
  applicant: "Applicant statement",
  derived: "Computed from the dataset",
  ai: "AI interpretation (not verified)",
  curated: "Curated research with cited sources",
};


interface Trace {
  impact: { metrics: string[]; views: string[]; comparisonsInvolving: string[]; mcpTools: string[] };
}

interface Ctx {
  claims: Map<string, Claim>;
  evidence: Map<string, Evidence>;
  sectionLabel: (key: string | null) => string;
  inspect: (id: string) => void;
  correct: (target: { type: "claim" | "initiative"; id: string; label: string }) => void;
}

const InspectorCtx = createContext<Ctx | null>(null);
const useInspector = () => {
  const c = useContext(InspectorCtx);
  if (!c) throw new Error("InspectorProvider missing");
  return c;
};

export interface CorrectionCopy {
  notice: string;
  categories: { value: string; label: string }[];
}

export function InspectorProvider({
  claims,
  evidence,
  sections,
  correction,
  children,
}: {
  claims: Claim[];
  evidence: Evidence[];
  sections: Record<string, string>;
  correction: CorrectionCopy;
  children: ReactNode;
}) {
  const claimMap = useMemo(() => new Map(claims.map((c) => [c.id, c])), [claims]);
  const evMap = useMemo(() => new Map(evidence.map((e) => [e.id, e])), [evidence]);
  const [open, setOpen] = useState<string | null>(null);
  const [target, setTarget] = useState<{ type: "claim" | "initiative"; id: string; label: string } | null>(null);

  const fromHash = useCallback(() => {
    const m = /^#claim=([A-Za-z0-9_-]+)$/.exec(window.location.hash);
    if (m?.[1] && claimMap.has(m[1])) setOpen(m[1]);
  }, [claimMap]);
  useEffect(() => {
    const t = setTimeout(fromHash, 0);
    window.addEventListener("hashchange", fromHash);
    return () => {
      clearTimeout(t);
      window.removeEventListener("hashchange", fromHash);
    };
  }, [fromHash]);

  const sectionLabel = useCallback(
    (key: string | null) => {
      if (!key) return "Not tied to a section";
      return sections[key] ?? key;
    },
    [sections],
  );

  const ctx: Ctx = { claims: claimMap, evidence: evMap, sectionLabel, inspect: setOpen, correct: setTarget };
  const claim = open ? claimMap.get(open) : undefined;
  return (
    <InspectorCtx.Provider value={ctx}>
      {children}
      <Sheet
        open={!!claim}
        onOpenChange={(o) => {
          if (!o) {
            setOpen(null);
            if (window.location.hash.startsWith("#claim=")) history.replaceState(null, "", window.location.pathname + window.location.search);
          }
        }}
        title="Source inspector"
        eyebrow={claim ? sectionLabel(claim.section) : undefined}
      >
        {claim && <ClaimDetail key={claim.id} claim={claim} />}
      </Sheet>
      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)} title="Suggest a correction" description={correction.notice}>
        {target && <CorrectionForm target={target} categories={correction.categories} onDone={() => setTarget(null)} />}
      </Dialog>
    </InspectorCtx.Provider>
  );
}

/** A claim line that opens the source inspector. */
export function ClaimLine({ id, showQuote = false, text, className }: { id: string; showQuote?: boolean; text?: string; className?: string }) {
  const { claims, inspect } = useInspector();
  const c = claims.get(id);
  if (!c) return null;
  return (
    <div className={cn("group flex items-start gap-3", className)}>
      <span className="w-[118px] shrink-0 pt-0.5 max-sm:w-auto">
        <StatusMark status={c.status} />
      </span>
      <div className="min-w-0 flex-1">
        <button type="button" onClick={() => inspect(c.id)} className="text-left text-base text-ink decoration-rule-2 underline-offset-4 hover:underline" aria-haspopup="dialog">
          {text ?? c.assertion}
        </button>
        {showQuote && c.quote && c.quote !== c.assertion && <p className="mt-1 border-l-2 border-rule pl-3 text-sm text-ink-2 italic">“{c.quote}”</p>}
      </div>
      <button type="button" onClick={() => inspect(c.id)} className="shrink-0 pt-0.5 text-2xs text-ink-3 hover:text-accent" aria-label={`Inspect sources for: ${c.assertion.slice(0, 80)}`}>
        Sources
      </button>
    </div>
  );
}

export function ClaimList({ ids, empty, showQuote }: { ids: string[]; empty: string; showQuote?: boolean }) {
  if (!ids.length) return <p className="text-sm text-ink-3">{empty}</p>;
  return (
    <ul className="divide-y divide-rule border-y border-rule">
      {ids.map((id) => (
        <li key={id} className="py-2.5" id={`claim-${id}`}>
          <ClaimLine id={id} showQuote={showQuote} />
        </li>
      ))}
    </ul>
  );
}

export function CorrectionButton({ type, id, label, className, children }: { type: "claim" | "initiative"; id: string; label: string; className?: string; children?: ReactNode }) {
  const { correct } = useInspector();
  return (
    <button type="button" onClick={() => correct({ type, id, label })} className={cn("text-xs text-ink-3 underline-offset-4 hover:text-accent hover:underline", className)}>
      {children ?? "Suggest a correction"}
    </button>
  );
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-ink-3">{label}</dt>
      <dd className="min-w-0 text-ink">{children}</dd>
    </>
  );
}

function EvidenceItem({ e, role }: { e: Evidence; role: "Supports" | "Contradicts" | "Context" }) {
  const facts = Object.entries(e.facts).filter(([, v]) => v !== null && v !== "");
  return (
    <li className="border-b border-rule py-3 last:border-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="eyebrow">
          {EVIDENCE_KIND_LABEL[e.kind]} · {role}
        </span>
        <span className={cn("text-2xs", e.ok ? "text-ink-3" : "text-st-partial")}>{e.ok ? "Check succeeded" : "Check did not succeed"}</span>
      </div>
      <p className="mt-1 text-sm font-medium">{e.title}</p>
      <ExternalLink href={e.url} className="text-xs break-all">
        {e.url}
      </ExternalLink>
      {e.excerpt && <p className="mt-1.5 line-clamp-4 border-l-2 border-rule pl-3 text-xs text-ink-2">{e.excerpt}</p>}
      {facts.length > 0 && (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-2xs">
          {facts.slice(0, 12).map(([k, v]) => (
            <Meta key={k} label={k}>
              <span className="num break-all">{String(v)}</span>
            </Meta>
          ))}
        </dl>
      )}
      <p className="mt-1.5 text-2xs text-ink-3">
        Observed {formatDateTime(e.observedAt)} · {e.provenance.method}
      </p>
    </li>
  );
}

function ClaimDetail({ claim }: { claim: Claim }) {
  const { evidence, sectionLabel, correct } = useInspector();
  const [trace, setTrace] = useState<Trace | null>(null);
  const [traceError, setTraceError] = useState(false);
  useEffect(() => {
    let live = true;
    fetch(`/api/v1/claims/${encodeURIComponent(claim.id)}/trace`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((b: { data: Trace }) => live && setTrace(b.data))
      .catch(() => live && setTraceError(true));
    return () => {
      live = false;
    };
  }, [claim.id]);

  const role = (id: string) => (claim.supportingEvidenceIds.includes(id) ? "Supports" : claim.contradictingEvidenceIds.includes(id) ? "Contradicts" : "Context");
  const evs = claim.evidenceIds.map((id) => evidence.get(id)).filter((e): e is Evidence => !!e);

  return (
    <div className="space-y-6">
      <div>
        <StatusMark status={claim.status} className="text-sm" />
        <p className="mt-0.5 text-2xs text-ink-3">{EVIDENCE_STATUS_LABEL[claim.status]}</p>
        <p className="mt-3 text-md text-ink">{claim.assertion}</p>
      </div>
      {claim.quote && (
        <figure>
          <figcaption className="eyebrow mb-1">Verbatim from the proposal</figcaption>
          <blockquote className="border-l-2 border-rule-2 pl-3 text-sm text-ink-2 italic">“{claim.quote}”</blockquote>
        </figure>
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
        <Meta label="Origin">{ORIGIN_LABEL[claim.origin]}</Meta>
        <Meta label="Section">{sectionLabel(claim.section)}</Meta>
        <Meta label="Material">{claim.material ? "Yes, affects the assessment" : "No, context only"}</Meta>
        <Meta label="Verified">{claim.verifiedAt ? formatDateTime(claim.verifiedAt) : "No verification date"}</Meta>
        <Meta label="Claim ID">
          <span className="num">{claim.id}</span>
        </Meta>
      </dl>
      <div>
        <p className="eyebrow mb-1">How this was checked</p>
        <p className="text-sm text-ink-2">{claim.verificationMethod}</p>
      </div>
      {claim.limitations.length > 0 && (
        <div>
          <p className="eyebrow mb-1">Limitations</p>
          <ul className="list-[square] space-y-1 pl-4 text-sm text-ink-2 marker:text-ink-3">
            {claim.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <p className="eyebrow mb-1">Evidence ({evs.length})</p>
        {evs.length ? <ul>{evs.map((e) => <EvidenceItem key={e.id} e={e} role={role(e.id)} />)}</ul> : <p className="text-sm text-ink-3">No evidence records are attached.</p>}
        {claim.sourceUrls.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs">
            {claim.sourceUrls.map((u) => (
              <li key={u}>
                <ExternalLink href={u} className="break-all">
                  {u}
                </ExternalLink>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className="eyebrow mb-1">Revision history</p>
        <ol className="space-y-2 border-l border-rule pl-3 text-xs">
          {claim.history.map((h, i) => (
            <li key={`${h.at}-${i}`}>
              <span className="num text-ink-3">{formatDate(h.at)}</span> · <StatusMark status={h.status} /> · <span className="text-ink-2">{h.reason}</span>
            </li>
          ))}
        </ol>
      </div>
      <div>
        <p className="eyebrow mb-1">Impact trace</p>
        {trace ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
            <Meta label="Metrics">{trace.impact.metrics.length ? <span className="num">{trace.impact.metrics.join(", ")}</span> : "None"}</Meta>
            <Meta label="Views">{trace.impact.views.join(" · ")}</Meta>
            {trace.impact.comparisonsInvolving.length > 0 && <Meta label="Related">{trace.impact.comparisonsInvolving.join(", ")}</Meta>}
            <Meta label="MCP tools">
              <span className="num">{trace.impact.mcpTools.join(", ")}</span>
            </Meta>
          </dl>
        ) : (
          <p className="text-xs text-ink-3">{traceError ? "The impact trace could not be loaded." : "Loading…"}</p>
        )}
      </div>
      <div className="flex flex-wrap gap-2 border-t border-rule pt-4">
        <BookmarkButton claim={claim} />
        <Button size="sm" onClick={() => correct({ type: "claim", id: claim.id, label: claim.assertion })}>
          Suggest a correction to this statement
        </Button>
      </div>
    </div>
  );
}

function BookmarkButton({ claim }: { claim: Claim }) {
  const w = useWorkspace();
  const saved = w.bookmarks.some((b) => b.claimId === claim.id);
  return (
    <Button
      size="sm"
      aria-pressed={saved}
      title="Bookmarks are stored in this browser only"
      onClick={() => toggleBookmark({ claimId: claim.id, initiativeId: claim.initiativeId, assertion: claim.assertion, status: claim.status })}
    >
      {saved ? "Bookmarked in My Workspace" : "Bookmark this evidence"}
    </Button>
  );
}

// ───────────────────────────── Correction form ─────────────────────────────

function CorrectionForm({ target, categories, onDone }: { target: { type: "claim" | "initiative"; id: string; label: string }; categories: { value: string; label: string }[]; onDone: () => void }) {
  const [startedAt] = useState(() => Date.now());
  // Pages are cached, so the store state is read when the form opens, not at build time.
  const [storeNotice, setStoreNotice] = useState<{ title: string; body: string } | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/v1/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { data?: { store?: { ok?: boolean; degraded?: boolean } } } | null) => {
        const st = j?.data?.store;
        if (live && st) setStoreNotice(correctionsStoreNotice({ failed: false, degraded: !!st.degraded || st.ok === false, backend: "mongodb" }));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const [state, setState] = useState<{ kind: "idle" | "sending" | "ok" | "error"; message?: string }>({ kind: "idle" });

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? "").trim();
    const body = {
      targetType: target.type,
      targetId: target.id,
      category: s("category"),
      proposedCorrection: s("proposedCorrection"),
      evidenceUrl: s("evidenceUrl"),
      explanation: s("explanation"),
      attribution: s("attribution") || null,
      contact: s("contact") || null,
      website: String(f.get("website") ?? ""),
      elapsedMs: Date.now() - startedAt,
    };
    setState({ kind: "sending" });
    try {
      const res = await fetch("/api/v1/corrections", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const json = (await res.json().catch(() => null)) as { data?: { message?: string }; error?: { message?: string } } | null;
      if (res.ok) setState({ kind: "ok", message: json?.data?.message ?? "Thank you. Your submission will be reviewed." });
      else setState({ kind: "error", message: json?.error?.message ?? `The submission failed (HTTP ${res.status}).` });
    } catch {
      setState({ kind: "error", message: "The submission could not be sent. Check your connection and try again." });
    }
  };

  if (state.kind === "ok")
    return (
      <div className="space-y-4">
        <p className="text-sm">{state.message}</p>
        <Button onClick={onDone}>Close</Button>
      </div>
    );

  const field = "w-full rounded-sm border border-rule-2 bg-paper px-2.5 py-1.5 text-sm text-ink focus:border-ink focus:outline-none";
  const label = "mb-1 block text-xs font-medium text-ink-2";
  return (
    <form onSubmit={submit} className="space-y-4">
      {storeNotice && (
        <div role="alert" className="border border-rule-2 bg-paper-2 px-3 py-2 text-sm">
          <p className="font-medium text-st-contradicted">{storeNotice.title}</p>
          <p className="mt-1 text-ink-2">{storeNotice.body}</p>
        </div>
      )}
      <div className="border-l-2 border-rule-2 pl-3">
        <p className="eyebrow mb-0.5">{target.type === "claim" ? "Statement" : "Initiative"}</p>
        <p className="line-clamp-3 text-sm text-ink">{target.label}</p>
      </div>
      <label className="block">
        <span className={label}>What kind of problem is it?</span>
        <select name="category" required className={field} defaultValue={categories[0]?.value}>
          {categories.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className={label}>Proposed correction</span>
        <textarea name="proposedCorrection" required minLength={10} maxLength={4000} rows={3} className={field} />
      </label>
      <label className="block">
        <span className={label}>Supporting evidence link (https)</span>
        <input name="evidenceUrl" type="url" required pattern="https://.*" maxLength={2000} placeholder="https://" className={field} />
      </label>
      <label className="block">
        <span className={label}>Explanation</span>
        <textarea name="explanation" required minLength={20} maxLength={6000} rows={4} className={field} />
        <span className="mt-1 block text-2xs text-ink-3">At least 20 characters. Explain what the evidence shows.</span>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={label}>Public attribution (optional)</span>
          <input name="attribution" maxLength={120} className={field} />
          <span className="mt-1 block text-2xs text-ink-3">Shown only if the correction is accepted.</span>
        </label>
        <label className="block">
          <span className={label}>Private contact (optional)</span>
          <input name="contact" maxLength={200} autoComplete="email" className={field} />
          <span className="mt-1 block text-2xs text-ink-3">Encrypted and never published.</span>
        </label>
      </div>
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      {state.kind === "error" && (
        <p role="alert" className="text-sm text-st-contradicted">
          {state.message}
        </p>
      )}
      <div className="flex items-center justify-between gap-3 border-t border-rule pt-4">
        <p className="text-2xs text-ink-3">A moderator reviews every submission. Nothing changes until it is accepted.</p>
        <Button type="submit" variant="primary" disabled={state.kind === "sending" || !!storeNotice}>
          {state.kind === "sending" ? "Sending…" : "Submit"}
        </Button>
      </div>
    </form>
  );
}
