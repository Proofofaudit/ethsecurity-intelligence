import { diffWords } from "diff";
import type { Revision } from "@/lib/domain/schemas";
import { formatDateTime, Money } from "@/components/ui/money";

export function Diff({ before, after }: { before: string; after: string }) {
  const parts = diffWords(before, after);
  return (
    <p className="text-sm leading-[22px] whitespace-pre-wrap wrap-anywhere text-ink-2">
      {parts.map((p, i) =>
        p.added ? (
          <ins key={i} className="bg-accent-wash text-ink no-underline">
            {p.value}
          </ins>
        ) : p.removed ? (
          <del key={i} className="text-ink-3 line-through decoration-ink-3">
            {p.value}
          </del>
        ) : (
          <span key={i}>{p.value}</span>
        ),
      )}
    </p>
  );
}

export interface DiffPart {
  key: string;
  label: string;
  before: string;
  after: string;
}

/** Fields that differ between two fetched revisions, as text suitable for a word diff. */
export function revisionDiffParts(prev: Revision, r: Revision, sectionHeadings: Record<string, string>): DiffPart[] {
  const changed: DiffPart[] = [];
  if ((prev.title ?? "") !== (r.title ?? "")) changed.push({ key: "title", label: "Title", before: prev.title ?? "", after: r.title ?? "" });
  if ((prev.summary ?? "") !== (r.summary ?? "")) changed.push({ key: "summary", label: "Summary", before: prev.summary ?? "", after: r.summary ?? "" });
  const keys = [...new Set([...Object.keys(prev.sections ?? {}), ...Object.keys(r.sections ?? {})])];
  for (const k of keys) {
    const a = prev.sections?.[k] ?? "";
    const b = r.sections?.[k] ?? "";
    if (a !== b) changed.push({ key: `s-${k}`, label: sectionHeadings[k] ?? k, before: a, after: b });
  }
  const ms = (x: Revision) => (x.milestones ?? []).map((m) => `${m.name} (${(m.amountCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })})${m.adoption ? " [adoption]" : ""}${m.done ? " [complete]" : ""}: ${m.criteria.join("; ")}`).join("\n");
  if (ms(prev) !== ms(r)) changed.push({ key: "milestones", label: "Milestones", before: ms(prev), after: ms(r) });
  return changed;
}

/** Official proposal revisions, newest first, each compared with the revision before it. */
export function ProposalHistory({ revisions, sectionHeadings }: { revisions: Revision[]; sectionHeadings: Record<string, string> }) {
  if (!revisions.length) return <p className="text-sm text-ink-3">No revisions are recorded.</p>;
  const byN = new Map(revisions.map((r) => [r.n, r]));
  return (
    <div>
      <p className="mb-3 text-xs text-ink-3">
        Text from each official revision compared word by word with the previous one. <ins className="bg-accent-wash text-ink no-underline">Added</ins> and <del className="text-ink-3">removed</del> text is marked.
      </p>
      <ol className="border-t border-ink">
        {revisions.map((r) => {
          const prev = byN.get(r.n - 1);
          const changed = prev && r.fetched && prev.fetched ? revisionDiffParts(prev, r, sectionHeadings) : [];
          const goalChanged = prev && prev.goalCents !== null && r.goalCents !== null && prev.goalCents !== r.goalCents;
          return (
            <li key={r.id} className="border-b border-rule py-3">
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="num text-sm font-semibold">Revision {r.n}</span>
                <span className="num text-xs text-ink-3">{formatDateTime(r.createdAt)}</span>
                {r.state && <span className="text-xs text-ink-3">State: {r.state}</span>}
                {r.archived && <span className="text-xs text-ink-3">Archived</span>}
                {goalChanged && (
                  <span className="text-xs text-ink-2">
                    Goal <Money cents={prev.goalCents} /> → <Money cents={r.goalCents} />
                  </span>
                )}
              </div>
              {!prev ? (
                <p className="mt-1 text-xs text-ink-3">First recorded revision.</p>
              ) : !r.fetched || !prev.fetched ? (
                <p className="mt-1 text-xs text-ink-3">Full text for this comparison was not retrieved.</p>
              ) : changed.length === 0 ? (
                <p className="mt-1 text-xs text-ink-3">No text, milestone or goal changes compared with revision {prev.n}.</p>
              ) : (
                <details className="group mt-1">
                  <summary className="text-xs text-ink-2 hover:text-accent">
                    Changed: {changed.map((c) => c.label).join(", ")} <span className="text-ink-3 group-open:hidden">· show differences</span>
                  </summary>
                  <div className="mt-3 space-y-4">
                    {changed.map((c) => (
                      <div key={c.key}>
                        <p className="eyebrow mb-1">{c.label}</p>
                        <Diff before={c.before} after={c.after} />
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
