"use client";

import type { ColumnDef, SortingState } from "@tanstack/react-table";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { DataTable, SortStatus } from "@/components/ui/data-table";
import { Check, selectClass, Segmented } from "@/components/ui/form";

export interface XrayRow {
  id: string;
  slug: string;
  initiative: string;
  type: "grant" | "rfp";
  index: number;
  name: string;
  amountCents: number;
  share: number | null;
  adoption: boolean;
  done: boolean;
  targetMonth: string | null;
  link: string | null;
  criteria: string[];
  questions: string[];
  thirdParty: string[];
}

type Tri = "any" | "yes" | "no";
const TRI: { value: Tri; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];
const tri = (t: Tri, v: boolean) => t === "any" || (t === "yes") === v;

export function MilestoneTable({ rows, initiatives, initialInitiative }: { rows: XrayRow[]; initiatives: { slug: string; label: string }[]; initialInitiative: string }) {
  const [ini, setIni] = useState(initialInitiative);
  const [adoption, setAdoption] = useState<Tri>("any");
  const [done, setDone] = useState<Tri>("any");
  const [criteria, setCriteria] = useState<Tri>("any");
  const [thirdParty, setThirdParty] = useState<Tri>("any");
  const [withQuestions, setWithQuestions] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);

  const filtered = useMemo(() => {
    const f = rows.filter(
      (r) =>
        (!ini || r.slug === ini) &&
        tri(adoption, r.adoption) &&
        tri(done, r.done) &&
        tri(criteria, r.criteria.join("").trim().length > 0) &&
        tri(thirdParty, r.adoption || r.thirdParty.length > 0) &&
        (!withQuestions || r.questions.length > 0),
    );
    const s = sorting[0];
    if (!s) return f;
    const key: Record<string, (r: XrayRow) => number | string> = {
      initiative: (r) => r.initiative.toLowerCase(),
      amount: (r) => r.amountCents,
      share: (r) => r.share ?? -1,
      questions: (r) => r.questions.length,
      target: (r) => r.targetMonth ?? "",
    };
    const k = key[s.id];
    if (!k) return f;
    const dir = s.desc ? -1 : 1;
    return [...f].sort((a, b) => (k(a) < k(b) ? -dir : k(a) > k(b) ? dir : a.initiative.localeCompare(b.initiative) || a.index - b.index));
  }, [rows, ini, adoption, done, criteria, thirdParty, withQuestions, sorting]);

  const columns = useMemo<ColumnDef<XrayRow, unknown>[]>(
    () => [
      {
        id: "initiative",
        header: "Initiative",
        enableSorting: true,
        cell: ({ row: { original: r } }) => (
          <Link href={`/initiatives/${r.slug}#milestones`} className="font-medium hover:text-accent">
            {r.initiative}
          </Link>
        ),
        meta: { className: "w-[16%]" },
      },
      {
        id: "name",
        header: "Milestone",
        enableSorting: false,
        cell: ({ row: { original: r } }) => (
          <details className="group">
            <summary className="cursor-pointer">
              <span className="num mr-1.5 text-ink-3">{r.index + 1}</span>
              {r.name}
              <span className="ml-1 text-2xs text-ink-3 group-open:hidden">details</span>
            </summary>
            <div className="mt-2 space-y-2 border-l border-rule pl-3 text-xs">
              <div>
                <p className="eyebrow">Acceptance criteria</p>
                {r.criteria.length ? (
                  <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-ink-2">
                    {r.criteria.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-ink-3">None recorded</p>
                )}
              </div>
              {r.thirdParty.length > 0 && <p className="text-ink-2">Criteria wording that names outside parties: {r.thirdParty.map((t) => `“${t}”`).join(", ")}</p>}
              {r.link && (
                <p>
                  Linked artifact:{" "}
                  <a href={r.link} target="_blank" rel="noopener noreferrer" className="link break-all">
                    {r.link.replace(/^https?:\/\//, "")}
                  </a>
                </p>
              )}
              {r.questions.length > 0 && (
                <div>
                  <p className="eyebrow">Questions</p>
                  <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-ink-2">
                    {r.questions.map((q) => (
                      <li key={q}>{q}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </details>
        ),
      },
      {
        id: "kind",
        header: "Type",
        enableSorting: false,
        cell: ({ row: { original: r } }) => <span className={r.adoption ? "text-st-partial" : "text-ink-2"}>{r.adoption ? "Adoption" : "Delivery"}</span>,
      },
      { id: "status", header: "Status", enableSorting: false, cell: ({ row: { original: r } }) => (r.done ? <span className="text-st-verified">Complete</span> : <span className="text-ink-3">Open</span>) },
      { id: "target", header: "Target", enableSorting: true, cell: ({ row: { original: r } }) => <span className="num text-xs">{r.targetMonth ?? <span className="font-sans text-ink-3">Not stated</span>}</span> },
      { id: "questions", header: "Questions", enableSorting: true, cell: ({ row: { original: r } }) => <span className="num">{r.questions.length}</span>, meta: { align: "right" } },
    ],
    [],
  );

  const reset = () => {
    setIni("");
    setAdoption("any");
    setDone("any");
    setCriteria("any");
    setThirdParty("any");
    setWithQuestions(false);
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-x-6 gap-y-3 border-y border-rule py-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className="mb-1 block text-ink-3">Initiative</span>
          <select className={selectClass} value={ini} onChange={(e) => setIni(e.target.value)}>
            <option value="">All initiatives</option>
            {initiatives.map((i) => (
              <option key={i.slug} value={i.slug}>
                {i.label}
              </option>
            ))}
          </select>
        </label>
        <div>
          <span className="mb-1 block text-ink-3">Adoption-designated</span>
          <Segmented label="Adoption-designated" value={adoption} onChange={setAdoption} options={TRI} />
        </div>
        <div>
          <span className="mb-1 block text-ink-3">Marked complete</span>
          <Segmented label="Marked complete" value={done} onChange={setDone} options={TRI} />
        </div>
        <div>
          <span className="mb-1 block text-ink-3">Has acceptance criteria</span>
          <Segmented label="Has acceptance criteria" value={criteria} onChange={setCriteria} options={TRI} />
        </div>
        <div>
          <span className="mb-1 block text-ink-3">Depends on third parties</span>
          <Segmented label="Depends on third parties" value={thirdParty} onChange={setThirdParty} options={TRI} />
        </div>
        <div className="flex items-end">
          <Check checked={withQuestions} onChange={setWithQuestions} className="text-xs">
            Only milestones with questions
          </Check>
        </div>
        <div className="flex items-end justify-between gap-3">
          <span aria-live="polite">
            <span className="num">{filtered.length}</span> of <span className="num">{rows.length}</span> milestones
          </span>
          <Button size="sm" variant="ghost" onClick={reset}>
            Reset filters
          </Button>
        </div>
      </div>
      <p className="text-2xs text-ink-3">&ldquo;Depends on third parties&rdquo; means an adoption milestone, or acceptance criteria that mention outside parties by rule-based wording.</p>
      {filtered.length === 0 ? (
        <p className="py-6 text-sm text-ink-3">No milestone matches these filters.</p>
      ) : (
        <>
          <SortStatus sorting={sorting} onReset={() => setSorting([])} />
          <DataTable data={filtered} columns={columns} sorting={sorting} onSortingChange={setSorting} getRowId={(r) => r.id} caption="Milestones across all cohort initiatives" />
        </>
      )}
    </div>
  );
}
