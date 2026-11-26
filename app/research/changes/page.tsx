import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "@/components/ui/icons";
import { Diff, revisionDiffParts } from "@/components/dossier/history";
import { Block, Note, PageHead } from "@/components/ui/layout";
import { DateTime, formatDate, formatDateTime, Money } from "@/components/ui/money";
import { SinceLastReview } from "@/components/workspace/since-review";
import type { ChangeRecord, Dataset, Funding, Revision } from "@/lib/domain/schemas";
import { loadIntelligence } from "@/lib/intelligence/load";
import { displayName, findInitiative } from "@/lib/intelligence/service";
import { cn } from "@/lib/util/cn";

export const metadata: Metadata = { title: "Changes over time" };
export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const PAGE = 30;

const changedParts = (c: ChangeRecord): string[] => {
  const a = c.after as { changed?: unknown } | undefined;
  return Array.isArray(a?.changed) ? a.changed.filter((x): x is string => typeof x === "string") : [];
};

/** Reviewer questions mapped to deterministic predicates over change records. */
const KINDS: { key: string; label: string; question: string; test: (c: ChangeRecord, d: Dataset) => boolean }[] = [
  {
    key: "funding",
    label: "Funding",
    question: "Did funding change?",
    test: (c) => c.kind === "funding_changed" || c.kind === "goal_changed" || c.kind === "donation_added",
  },
  {
    key: "pledges",
    label: "Pledges",
    question: "Was a pledge added, removed or received?",
    test: (c) => c.kind.startsWith("pledge_"),
  },
  {
    key: "scope",
    label: "Proposal scope",
    question: "Did the proposal text or scope change?",
    test: (c) => c.kind === "text_changed" || (c.kind === "revision_added" && changedParts(c).some((p) => /^(title|summary|sections)/.test(p))),
  },
  {
    key: "milestones",
    label: "Milestones",
    question: "Were milestones modified or completed?",
    test: (c) => c.kind === "milestones_changed" || c.kind === "milestone_completed" || (c.kind === "revision_added" && changedParts(c).some((p) => p.startsWith("milestones"))),
  },
  {
    key: "evidence",
    label: "Evidence status",
    question: "Did a statement gain or lose supporting evidence?",
    test: (c) => c.kind === "claim_status_changed",
  },
  {
    key: "corrections",
    label: "Corrections",
    question: "Was a statement corrected?",
    test: (c) => c.kind === "correction_published",
  },
  {
    key: "eligibility",
    label: "Ballot eligibility",
    question: "Did ballot eligibility change?",
    test: (c) => c.kind === "eligibility_changed",
  },
];

const FUNDING_FIELDS: { k: keyof Funding; label: string }[] = [
  { k: "goalCents", label: "Goal" },
  { k: "officialRaisedCents", label: "Official raised" },
  { k: "pledgedCents", label: "Outstanding pledges" },
  { k: "donatedCents", label: "Received (donations)" },
  { k: "receivedCents", label: "Pledges marked received" },
  { k: "remainingCents", label: "Remaining" },
];

function FundingDiff({ before, after }: { before: Partial<Funding>; after: Partial<Funding> }) {
  const rows = FUNDING_FIELDS.filter((f) => typeof before[f.k] === "number" && typeof after[f.k] === "number" && before[f.k] !== after[f.k]);
  if (!rows.length) return null;
  return (
    <table className="mt-2 text-xs">
      <caption className="sr-only">Funding fields that changed</caption>
      <tbody>
        {rows.map((f) => (
          <tr key={f.k}>
            <th scope="row" className="py-0.5 pr-4 text-left font-normal text-ink-3">
              {f.label}
            </th>
            <td className="py-0.5 pr-2 text-right">
              <Money cents={before[f.k] as number} />
            </td>
            <td className="px-1 text-ink-3">
              <ArrowRight />
              <span className="sr-only">to</span>
            </td>
            <td className="py-0.5 pl-2 text-right">
              <Money cents={after[f.k] as number} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MilestoneDiff({ prev, next }: { prev: Revision; next: Revision }) {
  const a = prev.milestones ?? [];
  const b = next.milestones ?? [];
  const n = Math.max(a.length, b.length);
  const rows = Array.from({ length: n }, (_, i) => ({ i, a: a[i], b: b[i] })).filter(
    (r) => !r.a || !r.b || r.a.name !== r.b.name || r.a.amountCents !== r.b.amountCents || r.a.adoption !== r.b.adoption || r.a.done !== r.b.done || r.a.criteria.join("|") !== r.b.criteria.join("|"),
  );
  if (!rows.length) return null;
  return (
    <div className="overflow-x-auto">
      <table className="mt-1 w-full min-w-[560px] text-xs">
        <caption className="sr-only">Milestones that differ between the two revisions</caption>
        <thead>
          <tr className="border-b border-rule text-left text-2xs text-ink-3 uppercase">
            <th scope="col" className="py-1 pr-3 font-medium">
              #
            </th>
            <th scope="col" className="py-1 pr-3 font-medium">
              Revision {prev.n}
            </th>
            <th scope="col" className="py-1 font-medium">
              Revision {next.n}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.i} className="border-b border-rule align-top">
              <td className="num py-1 pr-3 text-ink-3">{r.i + 1}</td>
              {[r.a, r.b].map((m, k) => (
                <td key={k} className="py-1 pr-3">
                  {m ? (
                    <>
                      <span className="font-medium">{m.name}</span> · <Money cents={m.amountCents} />
                      {m.adoption && " · adoption"}
                      {m.done && " · complete"}
                      {m.criteria.length > 0 && <span className="block text-ink-3">{m.criteria.join("; ")}</span>}
                    </>
                  ) : (
                    <span className="text-ink-3">{k === 0 ? "Not present (added)" : "Removed"}</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function ChangesPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { dataset: d } = await loadIntelligence();
  const sinceRaw = one(sp.since).slice(0, 40);
  const since = sinceRaw && Number.isFinite(Date.parse(sinceRaw)) ? sinceRaw : "";
  const ini = one(sp.ini) ? findInitiative(d, one(sp.ini)) : undefined;
  const kind = KINDS.find((k) => k.key === one(sp.kind));
  const page = Math.max(1, Math.min(100, Number.parseInt(one(sp.page) || "1", 10) || 1));

  const scoped = d.changes.filter((c) => (!since || c.detectedAt >= since) && (!ini || c.initiativeId === ini.id)).sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
  const items = kind ? scoped.filter((c) => kind.test(c, d)) : scoped;
  const pages = Math.max(1, Math.ceil(items.length / PAGE));
  const shown = items.slice((page - 1) * PAGE, page * PAGE);
  const byId = new Map(d.initiatives.map((i) => [i.id, i]));
  const name = (id: string | null) => {
    const i = id ? byId.get(id) : undefined;
    return i ? displayName(d, i) : "Cohort";
  };
  const revs = new Map(d.revisions.map((r) => [`${r.initiativeId}:${r.n}`, r]));
  const latestChangeAt = d.changes.reduce<string | null>((m, c) => (m === null || c.detectedAt > m ? c.detectedAt : m), null);
  const earliest = d.changes.reduce<string | null>((m, c) => (m === null || c.detectedAt < m ? c.detectedAt : m), null);
  const raisedUp = scoped.filter((c) => c.kind === "funding_changed" && ((c.after as Funding | undefined)?.officialRaisedCents ?? 0) > ((c.before as Funding | undefined)?.officialRaisedCents ?? 0));

  const href = (next: Record<string, string>) => {
    const p = new URLSearchParams();
    const merged = { since, ini: ini?.slug ?? "", kind: kind?.key ?? "", ...next };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/research/changes?${s}` : "/research/changes";
  };

  return (
    <div className="space-y-8">
      <PageHead
        eyebrow="Research · Time machine"
        title="What changed, and when"
        lede={
          <p>
            Changes are detected by comparing official snapshots and by comparing each official proposal revision with the previous one. The log covers {formatDate(earliest)} to {formatDate(latestChangeAt)}. Nothing here is sent anywhere; alerts for your saved assessments appear in{" "}
            <Link href="/workspace" className="link">
              My Workspace
            </Link>
            .
          </p>
        }
      />

      <form method="get" action="/research/changes" className="grid gap-3 border-y border-rule py-3 text-xs sm:grid-cols-2 lg:grid-cols-[auto_minmax(0,1fr)_auto_auto] lg:items-end">
        <label className="block">
          <span className="mb-1 block text-ink-3">Since</span>
          <input type="date" name="since" defaultValue={since.slice(0, 10)} className="h-8 rounded-xs border border-rule-2 bg-paper px-2 text-sm focus:border-ink focus:outline-none" />
        </label>
        <label className="block min-w-0">
          <span className="mb-1 block text-ink-3">Initiative</span>
          <select name="ini" defaultValue={ini?.slug ?? ""} className="h-8 w-full rounded-xs border border-rule-2 bg-paper px-1.5 text-sm focus:border-ink focus:outline-none">
            <option value="">All initiatives</option>
            {[...d.initiatives]
              .sort((a, b) => displayName(d, a).localeCompare(displayName(d, b)))
              .map((i) => (
                <option key={i.id} value={i.slug}>
                  {displayName(d, i)}
                </option>
              ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-ink-3">Kind</span>
          <select name="kind" defaultValue={kind?.key ?? ""} className="h-8 w-full rounded-xs border border-rule-2 bg-paper px-1.5 text-sm focus:border-ink focus:outline-none">
            <option value="">All kinds</option>
            {KINDS.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-3">
          <button type="submit" className="h-8 rounded-sm border border-ink bg-ink px-3 text-sm text-paper hover:opacity-90">
            Apply
          </button>
          <Link href="/research/changes" className="text-ink-3 hover:text-accent">
            Reset
          </Link>
        </div>
      </form>
      <SinceLastReview basePath="/research/changes" latestChangeAt={latestChangeAt} />

      <Block title={`Answers for the current selection${since ? ` since ${formatDateTime(since)}` : ""}${ini ? `, ${name(ini.id)}` : ""}`}>
        <ul className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-4">
          {KINDS.map((k) => {
            const n = scoped.filter((c) => k.test(c, d)).length;
            const extra = k.key === "funding" && n > 0 ? `${raisedUp.length} with official raised going up` : null;
            return (
              <li key={k.key} className="border-b border-rule py-2">
                <Link href={href({ kind: k.key, page: "" })} className={cn("group block", kind?.key === k.key && "text-accent")}>
                  <span className="block text-xs text-ink-3 group-hover:text-accent">{k.question}</span>
                  <span className="text-sm font-medium">{n === 0 ? "None recorded" : `${n} ${n === 1 ? "change" : "changes"}`}</span>
                  {extra && <span className="ml-2 text-xs text-ink-3">{extra}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
        <Note className="mt-2">&ldquo;None recorded&rdquo; means the change log holds no such record for this selection. Pledges and claim statuses are compared between consecutive published snapshots.</Note>
      </Block>

      <section aria-labelledby="log-h">
        <h2 id="log-h" className="flex flex-wrap items-baseline justify-between gap-2 border-t border-ink pt-3">
          <span className="text-md font-semibold">
            Change log <span className="num text-sm font-normal text-ink-3">{items.length}</span>
          </span>
          {kind && (
            <Link href={href({ kind: "", page: "" })} className="text-xs text-ink-3 hover:text-accent">
              Showing {kind.label.toLowerCase()} only · show all kinds
            </Link>
          )}
        </h2>
        {shown.length === 0 ? (
          <p className="py-6 text-sm text-ink-3">No changes match this selection.</p>
        ) : (
          <ol className="divide-y divide-rule">
            {shown.map((c) => {
              const i = c.initiativeId ? byId.get(c.initiativeId) : undefined;
              const b = c.before as { n?: number } | undefined;
              const a = c.after as { n?: number } | undefined;
              const prev = c.kind === "revision_added" && c.initiativeId && typeof b?.n === "number" ? revs.get(`${c.initiativeId}:${b.n}`) : undefined;
              const next = c.kind === "revision_added" && c.initiativeId && typeof a?.n === "number" ? revs.get(`${c.initiativeId}:${a.n}`) : undefined;
              const headings = Object.fromEntries((i?.sections ?? []).map((s) => [s.key, s.heading]));
              const parts = prev && next && prev.fetched && next.fetched ? revisionDiffParts(prev, next, headings).filter((p) => p.key !== "milestones") : [];
              const msChanged = prev && next && (prev.milestones ?? []).length + (next.milestones ?? []).length > 0;
              return (
                <li key={c.id} className="grid gap-x-6 gap-y-1 py-3 md:grid-cols-[150px_minmax(0,1fr)]">
                  <div className="text-xs text-ink-3">
                    <DateTime iso={c.detectedAt} withTime />
                    <span className="block">{c.source === "official_revision" ? "Official revision" : c.source === "snapshot_diff" ? "Snapshot comparison" : c.source === "correction" ? "Correction" : "Research"}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm">
                      {i ? (
                        <Link href={`/initiatives/${i.slug}#history`} className="font-medium hover:text-accent">
                          {name(i.id)}
                        </Link>
                      ) : (
                        <span className="font-medium">Cohort</span>
                      )}
                      <span className="text-ink-2"> · {c.summary}</span>
                    </p>
                    {c.kind === "funding_changed" && <FundingDiff before={(c.before ?? {}) as Partial<Funding>} after={(c.after ?? {}) as Partial<Funding>} />}
                    {prev && next && (parts.length > 0 || msChanged) && (
                      <details className="group mt-1">
                        <summary className="text-xs text-ink-3 hover:text-accent">
                          <span className="group-open:hidden">Show the differences between revision {prev.n} and {next.n}</span>
                          <span className="hidden group-open:inline">Hide differences</span>
                        </summary>
                        <div className="mt-2 space-y-3 border-l border-rule pl-3">
                          {prev.goalCents !== null && next.goalCents !== null && prev.goalCents !== next.goalCents && (
                            <p className="text-xs">
                              Goal <Money cents={prev.goalCents} /> <ArrowRight /> <Money cents={next.goalCents} />
                            </p>
                          )}
                          <MilestoneDiff prev={prev} next={next} />
                          {parts.map((p) => (
                            <div key={p.key}>
                              <p className="eyebrow mb-1">{p.label}</p>
                              <Diff before={p.before} after={p.after} />
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {pages > 1 && (
          <nav aria-label="Pages" className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            {page > 1 && (
              <Link href={href({ page: String(page - 1) })} className="link">
                Newer
              </Link>
            )}
            <span className="text-xs text-ink-3">
              Page <span className="num">{page}</span> of <span className="num">{pages}</span>
            </span>
            {page < pages && (
              <Link href={href({ page: String(page + 1) })} className="link">
                Older
              </Link>
            )}
          </nav>
        )}
      </section>
    </div>
  );
}
