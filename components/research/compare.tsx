"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, ExternalLink, Tag } from "@/components/ui/button";
import { AddPicker, Check, type PickOption } from "@/components/ui/form";
import { saveComparison, useWorkspace } from "@/components/workspace/store";
import type { CompareRow } from "@/lib/intelligence/service";
import { cn } from "@/lib/util/cn";

interface Result {
  initiatives: { id: string; slug: string; shortTitle: string; title: string; organization: string | null; url: string }[];
  rows: CompareRow[];
  hypotheses: { id: string; type: string; reason: string; a: string; b: string }[];
  methodology: string;
}

/** Rows that link to the dossier section holding the original evidence. */
const EVIDENCE_ANCHOR: Record<string, string> = {
  Funding: "financial",
  Milestones: "milestones",
  Adoption: "adoption",
  Evidence: "sources",
  Technical: "code",
  Dependencies: "dependencies",
  "Existing work": "exists",
  "Security problem": "problem",
  Maintenance: "technical",
  Beneficiaries: "problem",
};

function Value({ v }: { v: string }) {
  const lines = v.split("\n").filter(Boolean);
  if (lines.length <= 1) return <span className="break-words">{v}</span>;
  return (
    <ul className="space-y-1">
      {lines.map((l, i) => (
        <li key={i} className="break-words">
          {l}
        </li>
      ))}
    </ul>
  );
}

export function CompareView({ selected, options, result }: { selected: string[]; options: PickOption[]; result: Result | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [saved, setSaved] = useState(false);
  const w = useWorkspace();

  const go = (ids: string[]) => start(() => router.replace(ids.length ? `${pathname}?ids=${ids.join(",")}` : pathname, { scroll: false }));
  const inis = result?.initiatives ?? [];
  const rows = result?.rows ?? [];
  const differing = rows.filter((r) => r.differs).length;
  const shown = onlyDiff ? rows.filter((r) => r.differs) : rows;
  const groups = [...new Set(shown.map((r) => r.group))];
  const alreadySaved = w.comparisons.some((c) => c.ids.join(",") === selected.join(","));
  const cols = { gridTemplateColumns: `minmax(150px, 200px) repeat(${Math.max(inis.length, 1)}, minmax(220px, 1fr))` };

  return (
    <div className={cn("space-y-6", pending && "opacity-70")}>
      <div className="grid gap-3 md:grid-cols-[minmax(0,360px)_1fr] md:items-center">
        <AddPicker options={options} selected={selected} max={5} onAdd={(id) => go([...selected, id])} placeholder="Add an initiative by name" label="Add an initiative to the comparison" />
        <ul className="flex flex-wrap gap-2" aria-label="Initiatives in this comparison">
          {inis.map((i) => (
            <li key={i.id} className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-rule-2 pl-2 text-xs">
              <span className="max-w-[220px] truncate">{i.shortTitle}</span>
              <button type="button" onClick={() => go(selected.filter((s) => s !== i.slug))} className="h-full px-1.5 text-ink-3 hover:text-accent" aria-label={`Remove ${i.shortTitle}`}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      </div>

      {inis.length < 2 ? (
        <p className="border-t border-rule pt-4 text-sm text-ink-2">{inis.length === 1 ? "Add at least one more initiative to compare." : "Add two to five initiatives to start."}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 border-y border-rule py-2.5">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <Check checked={onlyDiff} onChange={setOnlyDiff}>
                Show only differences
              </Check>
              <span className="text-xs text-ink-3">
                <span className="num">{differing}</span> of <span className="num">{rows.length}</span> rows differ · <span className="num">{rows.length - differing}</span> identical
              </span>
            </div>
            <Button
              size="sm"
              disabled={alreadySaved || saved}
              onClick={() => {
                saveComparison(inis.map((i) => i.shortTitle).join(" · "), selected);
                setSaved(true);
              }}
            >
              {alreadySaved || saved ? "Saved in My Workspace" : "Save comparison to My Workspace"}
            </Button>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-fit text-sm">
              <div className="sticky top-0 z-10 grid border-b border-ink bg-paper" style={cols}>
                <div className="py-2 pr-3 text-2xs tracking-wide text-ink-3 uppercase">Attribute</div>
                {inis.map((i) => (
                  <div key={i.id} className="min-w-0 border-l border-rule px-3 py-2">
                    <Link href={`/initiatives/${i.slug}`} className="block font-semibold hover:text-accent" title={i.title}>
                      {i.shortTitle}
                    </Link>
                    <span className="block truncate text-xs text-ink-3">{i.organization ?? "No designated recipient (RFP)"}</span>
                    <span className="mt-1 flex gap-3 text-2xs">
                      <ExternalLink href={i.url}>Official page</ExternalLink>
                      <Link href={`/initiatives/${i.slug}#sources`} className="text-ink-3 hover:text-accent">
                        Evidence
                      </Link>
                    </span>
                  </div>
                ))}
              </div>
              {groups.map((g) => (
                <section key={g} aria-label={g}>
                  <div className="grid items-end border-b border-rule pt-4 pb-1.5" style={cols}>
                    <h3 className="eyebrow">{g}</h3>
                    {EVIDENCE_ANCHOR[g] &&
                      inis.map((i) => (
                        <Link key={i.id} href={`/initiatives/${i.slug}#${EVIDENCE_ANCHOR[g]}`} className="px-3 text-2xs text-ink-3 hover:text-accent">
                          Source in dossier
                        </Link>
                      ))}
                  </div>
                  {shown
                    .filter((r) => r.group === g)
                    .map((r) => (
                      <div key={r.key} className={cn("grid border-b border-rule align-top", !r.differs && "bg-paper-2/60")} style={cols}>
                        <div className="py-2 pr-3 text-xs font-medium text-ink-2">
                          {r.label}
                          {!r.differs && <span className="mt-0.5 block text-2xs font-normal text-st-verified">Same for all</span>}
                        </div>
                        {r.differs ? (
                          r.values.map((v, idx) => (
                            <div key={idx} className="min-w-0 border-l border-rule px-3 py-2 text-xs">
                              <Value v={v} />
                            </div>
                          ))
                        ) : (
                          <div className="min-w-0 border-l border-rule px-3 py-2 text-xs" style={{ gridColumn: `span ${inis.length}` }}>
                            <Value v={r.values[0] ?? ""} />
                          </div>
                        )}
                      </div>
                    ))}
                </section>
              ))}
              {shown.length === 0 && <p className="py-4 text-sm text-ink-3">Every compared row is identical for these initiatives.</p>}
            </div>
          </div>

          <section className="grid gap-8 md:grid-cols-2">
            <div className="border-t border-ink pt-3">
              <h2 className="text-md font-semibold">Relationship hypotheses among these initiatives</h2>
              {result?.hypotheses.length ? (
                <ul className="mt-2 space-y-2 text-sm">
                  {result.hypotheses.map((h) => (
                    <li key={h.id}>
                      <span className="font-medium">
                        {h.a} and {h.b}
                      </span>{" "}
                      <Tag className="border-st-partial text-st-partial">{h.type === "potentially_overlaps" ? "Potentially overlaps" : "Potentially complements"} · hypothesis</Tag>
                      <p className="mt-0.5 text-xs text-ink-3">{h.reason.replace(/^overlap@\d+:\s*/, "")}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-ink-3">The collaboration analysis flagged no overlap or complement between these initiatives.</p>
              )}
            </div>
            <div className="border-t border-ink pt-3">
              <h2 className="text-md font-semibold">How this comparison works</h2>
              <p className="mt-2 text-sm text-ink-2">{result?.methodology}</p>
              <p className="mt-2 text-xs text-ink-3">
                Rows marked &ldquo;Same for all&rdquo; have literally identical values. Quoted sentences (maintenance, beneficiaries) are selected by keyword rules from the proposal text and are applicant statements, not verified facts. Order of columns is the order you chose.
              </p>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
