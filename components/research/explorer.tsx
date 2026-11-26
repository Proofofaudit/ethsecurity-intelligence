"use client";

import type { ColumnDef, SortingState } from "@tanstack/react-table";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { Button, ButtonLink, Tag } from "@/components/ui/button";
import { FundingBar } from "@/components/ui/charts";
import { DataTable } from "@/components/ui/data-table";
import { Money, Pct } from "@/components/ui/money";
import { SaveButton } from "@/components/workspace/save-button";
import { removeSearch, saveSearch, useWorkspace } from "@/components/workspace/store";
import type { InitiativeSummary } from "@/lib/intelligence/service";
import { NEUTRAL_SORT_LABEL } from "@/lib/neutralLanguage";
import { cn } from "@/lib/util/cn";
import { activeFilterCount, toQuery, type ResearchParams } from "./params";

type Row = InitiativeSummary & { matchedTerms: string[] };
interface Option {
  value: string;
  label: string;
  count: number;
}
export interface Facets {
  categories: Option[];
  stages: Option[];
  standards: Option[];
  organizations: Option[];
  cohortSize: number;
}

const MAX_COMPARE = 5;

/** Sort options. The first is the neutral default; the others are chosen explicitly by the reviewer. */
const SORT_OPTIONS: { value: Exclude<ResearchParams["sort"], ""> | "relevance"; label: string }[] = [
  { value: "title", label: NEUTRAL_SORT_LABEL },
  { value: "relevance", label: "Search relevance (BM25)" },
  { value: "goal", label: "Requested amount" },
  { value: "pct", label: "Funding progress" },
  { value: "ask", label: "TheDAO ask" },
  { value: "remaining", label: "Remaining funding gap" },
  { value: "milestones", label: "Number of milestones" },
];

export function ResearchExplorer({ params, invalid, items, total, sortNote, facets }: { params: ResearchParams; invalid: string | null; items: Row[]; total: number; sortNote: string; facets: Facets }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<string[]>([]);
  const [q, setQ] = useState(params.q);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const workspace = useWorkspace();
  const lastPushed = useRef(params.q);

  const push = (next: Partial<ResearchParams>) => {
    const qs = toQuery({ ...params, ...next });
    start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  // Debounced free-text search.
  useEffect(() => {
    if (q === lastPushed.current) return;
    const t = setTimeout(() => {
      lastPushed.current = q;
      const qs = toQuery({ ...params, q, sort: q && !params.q ? "" : params.sort });
      start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    }, 280);
    return () => clearTimeout(t);
  }, [q, params, pathname, router]);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= MAX_COMPARE ? s : [...s, id]));
  const bySlug = new Map(items.map((i) => [i.id, i]));
  const active = activeFilterCount(params);
  const currentQuery = toQuery(params);

  const sorting: SortingState = params.sort ? [{ id: params.sort, desc: params.order === "desc" }] : [];
  const onSort = (s: SortingState) => {
    const x = s[0];
    push(x ? { sort: x.id as ResearchParams["sort"], order: x.desc ? "desc" : "asc" } : { sort: "", order: "" });
  };

  const sortValue = params.sort || (params.q ? "relevance" : "title");
  const onSortSelect = (v: string) => {
    if (v === "relevance" || (v === "title" && !params.q)) push({ sort: "", order: "" });
    else push({ sort: v as ResearchParams["sort"], order: params.sort === v ? params.order : "asc" });
  };

  const columns = useMemo<ColumnDef<Row, unknown>[]>(
    () => [
      {
        id: "select",
        enableSorting: false,
        header: () => <span className="sr-only">Select for comparison</span>,
        cell: ({ row }) => (
          <input
            type="checkbox"
            className="mt-1 size-3.5 accent-[var(--accent)]"
            checked={selected.includes(row.original.id)}
            disabled={!selected.includes(row.original.id) && selected.length >= MAX_COMPARE}
            onChange={() => toggle(row.original.id)}
            aria-label={`Select ${row.original.shortTitle} for comparison`}
          />
        ),
        meta: { className: "w-6" },
      },
      {
        id: "title",
        header: "Initiative",
        cell: ({ row }) => <TitleCell r={row.original} />,
        meta: { className: "min-w-[260px] max-w-[380px]" },
      },
      {
        id: "type",
        enableSorting: false,
        header: "Type",
        cell: ({ row }) => <span className="text-xs text-ink-2">{row.original.type === "rfp" ? "RFP" : "Grant"}</span>,
      },
      {
        id: "goal",
        header: "Requested",
        cell: ({ row }) => <Money cents={row.original.goalCents} />,
        meta: { align: "right" },
      },
      {
        id: "pct",
        header: "Funding",
        cell: ({ row }) => (
          <div className="w-36">
            <FundingBar f={row.original} height={5} />
            <div className="mt-1 flex justify-between text-2xs text-ink-3">
              <Pct value={row.original.pct} digits={0} />
              <span>
                <Money cents={row.original.raisedCents} compact /> raised
              </span>
            </div>
          </div>
        ),
        meta: { headerTitle: "Received and pledged as a share of the goal" },
      },
      {
        id: "ask",
        header: "TheDAO ask",
        cell: ({ row }) => <Money cents={row.original.theDaoAskCents} reason="Goal or raised unavailable" />,
        meta: { align: "right", headerTitle: "Goal minus official raised, floored at $0 and capped at $200,000" },
      },
      {
        id: "remaining",
        header: "Remaining gap",
        cell: ({ row }) => <Money cents={row.original.remainingCents} className="text-ink-2" />,
        meta: { align: "right", headerTitle: "Remaining funding gap: goal minus official raised, floored at $0, uncapped" },
      },
      {
        id: "milestones",
        header: "Milestones",
        cell: ({ row }) => (
          <span className="text-xs text-ink-2">
            <span className="num text-sm text-ink">{row.original.milestones}</span>
            {row.original.adoptionMilestones > 0 && <span className="block">{row.original.adoptionMilestones} adoption</span>}
            {row.original.completedMilestones > 0 && <span className="block">{row.original.completedMilestones} complete</span>}
          </span>
        ),
        meta: { align: "right" },
      },
      {
        id: "evidence",
        enableSorting: false,
        header: "Evidence",
        cell: ({ row }) => <EvidenceCell r={row.original} />,
        meta: { headerTitle: "Claims with independent or partial supporting evidence, out of all extracted claims" },
      },
      {
        id: "save",
        enableSorting: false,
        header: () => <span className="sr-only">Workspace</span>,
        cell: ({ row }) => <SaveButton id={row.original.id} title={row.original.shortTitle} compact />,
        meta: { align: "right", className: "w-10" },
      },
    ],
    [selected],
  );

  const filters = (
    <FilterPanel
      params={params}
      facets={facets}
      onChange={push}
      onClear={() => {
        setQ("");
        lastPushed.current = "";
        start(() => router.replace(params.view === "cards" ? `${pathname}?view=cards` : pathname, { scroll: false }));
      }}
      active={active}
    />
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside aria-label="Filters" className="max-lg:hidden">
        <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto pr-2 pb-8">{filters}</div>
      </aside>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search initiatives</span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by initiative, organization, technology or security problem"
              className="h-10 w-full rounded-sm border border-rule-2 bg-paper px-3 text-base text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none"
            />
          </label>
          <Button className="lg:hidden" onClick={() => setFiltersOpen((o) => !o)} aria-expanded={filtersOpen} aria-controls="mobile-filters">
            Filters{active ? ` (${active})` : ""}
          </Button>
        </div>
        {filtersOpen && (
          <div id="mobile-filters" className="mt-3 border-y border-rule py-4 lg:hidden">
            {filters}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-rule pb-3">
          <p className="text-sm" aria-live="polite">
            <span className="num font-medium">{total}</span> of <span className="num">{facets.cohortSize}</span> initiatives
            <span className="ml-2 text-xs text-ink-3">{sortNote}</span>
            {pending && <span className="ml-2 text-xs text-ink-3">Updating…</span>}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-ink-3">
              Sort
              <select
                value={sortValue}
                onChange={(e) => onSortSelect(e.target.value)}
                className="h-7 rounded-xs border border-rule-2 bg-paper px-1.5 text-xs text-ink focus:border-ink focus:outline-none"
              >
                {SORT_OPTIONS.filter((o) => o.value !== "relevance" || params.q).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <SaveSearch query={currentQuery} disabled={!currentQuery} />
            <div role="group" aria-label="View" className="flex rounded-sm border border-rule-2 p-0.5">
              {(["table", "cards"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={params.view === v}
                  onClick={() => push({ view: v })}
                  className={cn("h-6 rounded-xs px-2 text-xs capitalize", params.view === v ? "bg-ink text-paper" : "text-ink-2 hover:text-ink")}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>

        {invalid && <p className="mt-3 text-sm text-st-partial">One filter value was not valid and was ignored: {invalid}</p>}
        {workspace.searches.length > 0 && <SavedSearches searches={workspace.searches} />}

        <div className={cn("transition-opacity", pending && "opacity-60")}>
          {items.length === 0 ? (
            <div className="border-b border-rule py-16 text-center">
              <p className="text-md font-medium">No initiative matches these filters.</p>
              <p className="mt-1 text-sm text-ink-3">Remove a filter or search for a broader term.</p>
            </div>
          ) : params.view === "cards" ? (
            <ul className="grid gap-x-8 md:grid-cols-2 2xl:grid-cols-3 [&>*]:min-w-0">
              {items.map((r) => (
                <Card key={r.id} r={r} selected={selected.includes(r.id)} disabled={!selected.includes(r.id) && selected.length >= MAX_COMPARE} onToggle={() => toggle(r.id)} />
              ))}
            </ul>
          ) : (
            <>
              <div className="max-md:hidden">
                <DataTable data={items} columns={columns} sorting={sorting} onSortingChange={onSort} getRowId={(r) => r.id} caption="Initiatives matching the current filters" rowClassName={(r) => (selected.includes(r.id) ? "bg-accent-wash/60" : undefined)} />
              </div>
              <ul className="md:hidden">
                {items.map((r) => (
                  <Card key={r.id} r={r} selected={selected.includes(r.id)} disabled={!selected.includes(r.id) && selected.length >= MAX_COMPARE} onToggle={() => toggle(r.id)} />
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {selected.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink bg-paper">
          <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-3 px-5 py-3 md:px-8">
            <span className="text-sm">
              <span className="num font-medium">{selected.length}</span> selected
              <span className="ml-2 text-xs text-ink-3">up to {MAX_COMPARE}</span>
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-ink-2">{selected.map((id) => bySlug.get(id)?.shortTitle ?? id).join(" · ")}</span>
            <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
              Clear
            </Button>
            {selected.length >= 2 ? (
              <ButtonLink variant="primary" size="sm" href={`/research/compare?ids=${selected.map((id) => bySlug.get(id)?.slug ?? id).join(",")}`}>
                Compare {selected.length}
              </ButtonLink>
            ) : (
              <span className="text-xs text-ink-3">Select one more to compare</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TitleCell({ r }: { r: Row }) {
  return (
    <div className="min-w-0">
      <Link href={`/initiatives/${r.slug}`} className="font-medium hover:text-accent" title={r.title}>
        {r.title}
      </Link>
      <div className="mt-0.5 text-xs text-ink-3">{r.organization ?? r.recipientTeam ?? "Request for proposals, no designated recipient"}</div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {r.categories.map((c) => (
          <Tag key={c.slug}>{c.label}</Tag>
        ))}
      </div>
      {r.matchedTerms.length > 0 && <div className="mt-1 text-2xs text-ink-3">Matched: {r.matchedTerms.slice(0, 6).join(", ")}</div>}
    </div>
  );
}

function EvidenceCell({ r }: { r: Row }) {
  return (
    <div className="space-y-0.5 text-xs whitespace-nowrap text-ink-2">
      <div>
        <span className="num text-sm text-ink">{r.supportedClaims}</span> of <span className="num">{r.claimCount}</span> supported
      </div>
      <div className="text-ink-3">{r.hasExistingWork ? "Existing work found" : "No existing work found"}</div>
      {!r.researchComplete && <div className="text-st-partial">Research incomplete</div>}
    </div>
  );
}

function Card({ r, selected, disabled, onToggle }: { r: Row; selected: boolean; disabled: boolean; onToggle: () => void }) {
  return (
    <li className={cn("border-b border-rule py-4", selected && "bg-accent-wash/50")}>
      <div className="flex items-start gap-3">
        <input type="checkbox" className="mt-1 size-3.5 accent-[var(--accent)]" checked={selected} disabled={disabled} onChange={onToggle} aria-label={`Select ${r.shortTitle} for comparison`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <TitleCell r={r} />
            <SaveButton id={r.id} title={r.shortTitle} compact />
          </div>
          <FundingBar f={r} height={5} className="mt-3" />
          <dl className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-ink-3">Requested</dt>
              <dd>
                <Money cents={r.goalCents} />
              </dd>
            </div>
            <div>
              <dt className="text-ink-3">Raised</dt>
              <dd>
                <Money cents={r.raisedCents} /> <span className="text-ink-3">(<Pct value={r.pct} digits={0} />)</span>
              </dd>
            </div>
            <div>
              <dt className="text-ink-3" title="Goal minus official raised, floored at $0 and capped at $200,000">
                TheDAO ask
              </dt>
              <dd>
                <Money cents={r.theDaoAskCents} reason="Goal or raised unavailable" />
              </dd>
            </div>
            <div>
              <dt className="text-ink-3">Milestones</dt>
              <dd className="num">
                {r.milestones}
                {r.adoptionMilestones > 0 && <span className="text-ink-3"> · {r.adoptionMilestones} adoption</span>}
              </dd>
            </div>
          </dl>
          <div className="mt-2">
            <EvidenceCell r={r} />
          </div>
        </div>
      </div>
    </li>
  );
}

function SaveSearch({ query, disabled }: { query: string; disabled: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size="sm"
      disabled={disabled}
      title={disabled ? "Set a search or filter first" : "Save this search to My Workspace (this browser only)"}
      onClick={() => {
        const name = new URLSearchParams(query).get("q") || describe(query);
        saveSearch(name, query);
        setDone(true);
        setTimeout(() => setDone(false), 1600);
      }}
    >
      {done ? "Saved" : "Save search"}
    </Button>
  );
}

function describe(query: string) {
  const p = new URLSearchParams(query);
  const parts = [...p.entries()].filter(([k]) => k !== "view").map(([k, v]) => `${k}: ${v}`);
  return parts.join(" · ").slice(0, 120) || "All initiatives";
}

function SavedSearches({ searches }: { searches: { id: string; name: string; query: string }[] }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-ink-3">Saved searches:</span>
      {searches.slice(0, 8).map((s) => (
        <span key={s.id} className="inline-flex items-center rounded-xs border border-rule">
          <Link href={`/research?${s.query}`} className="px-1.5 py-0.5 hover:text-accent">
            {s.name}
          </Link>
          <button type="button" onClick={() => removeSearch(s.id)} className="border-l border-rule px-1 text-ink-3 hover:text-ink" aria-label={`Remove saved search ${s.name}`}>
            ×
          </button>
        </span>
      ))}
    </div>
  );
}

// ───────────────────────────── Filters ─────────────────────────────

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="border-b border-rule py-3 first:pt-0">
      <legend className="eyebrow float-left mb-2 w-full">{title}</legend>
      <div className="clear-both">{children}</div>
    </fieldset>
  );
}

function Segmented<T extends string>({ name, value, options, onChange }: { name: string; value: T | ""; options: { value: T | ""; label: string }[]; onChange: (v: T | "") => void }) {
  return (
    <div role="radiogroup" aria-label={name} className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.value || "any"}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn("h-6 rounded-xs border px-2 text-xs", value === o.value ? "border-ink bg-ink text-paper" : "border-rule-2 text-ink-2 hover:border-ink-3 hover:text-ink")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Checks({ options, values, onChange, limit = 99 }: { options: Option[]; values: string[]; onChange: (v: string[]) => void; limit?: number }) {
  const [all, setAll] = useState(false);
  const shown = all ? options : options.slice(0, limit);
  return (
    <ul className="space-y-1">
      {shown.map((o) => (
        <li key={o.value}>
          <label className="flex cursor-pointer items-baseline gap-2 text-sm">
            <input
              type="checkbox"
              className="size-3.5 translate-y-[2px] accent-[var(--accent)]"
              checked={values.includes(o.value)}
              onChange={(e) => onChange(e.target.checked ? [...values, o.value] : values.filter((v) => v !== o.value))}
            />
            <span className="min-w-0 flex-1 truncate">{o.label}</span>
            <span className="num text-2xs text-ink-3">{o.count}</span>
          </label>
        </li>
      ))}
      {options.length > limit && (
        <li>
          <button type="button" className="text-xs text-ink-3 hover:text-accent" onClick={() => setAll((a) => !a)}>
            {all ? "Show fewer" : `Show all ${options.length}`}
          </button>
        </li>
      )}
    </ul>
  );
}

function Range({ label, unit, min, max, onCommit }: { label: string; unit: string; min: string; max: string; onCommit: (min: string, max: string) => void }) {
  const [a, setA] = useState(min);
  const [b, setB] = useState(max);
  const commit = () => {
    const clean = (s: string) => (/^\d+(\.\d+)?$/.test(s.trim()) ? s.trim() : "");
    if (clean(a) !== min || clean(b) !== max) onCommit(clean(a), clean(b));
  };
  const input = "num h-7 w-full min-w-0 rounded-xs border border-rule-2 bg-paper px-2 text-xs focus:border-ink focus:outline-none";
  return (
    <div className="flex items-center gap-2" onKeyDown={(e) => e.key === "Enter" && commit()}>
      <label className="min-w-0 flex-1">
        <span className="sr-only">{label} minimum</span>
        <input inputMode="decimal" placeholder={`Min ${unit}`} value={a} onChange={(e) => setA(e.target.value)} onBlur={commit} className={input} />
      </label>
      <span className="text-ink-3">–</span>
      <label className="min-w-0 flex-1">
        <span className="sr-only">{label} maximum</span>
        <input inputMode="decimal" placeholder={`Max ${unit}`} value={b} onChange={(e) => setB(e.target.value)} onBlur={commit} className={input} />
      </label>
    </div>
  );
}

const YN = [
  { value: "" as const, label: "Any" },
  { value: "yes" as const, label: "Yes" },
  { value: "no" as const, label: "No" },
];

function FilterPanel({ params, facets, onChange, onClear, active }: { params: ResearchParams; facets: Facets; onChange: (p: Partial<ResearchParams>) => void; onClear: () => void; active: number }) {
  const select = "h-7 w-full rounded-xs border border-rule-2 bg-paper px-1.5 text-xs text-ink focus:border-ink focus:outline-none";
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <p className="text-sm font-semibold">Filters</p>
        {active > 0 && (
          <button type="button" onClick={onClear} className="text-xs text-ink-3 hover:text-accent">
            Clear {active}
          </button>
        )}
      </div>
      <Group title="Grant or RFP">
        <Segmented
          name="Grant or RFP"
          value={params.type}
          onChange={(v) => onChange({ type: v })}
          options={[
            { value: "", label: "All" },
            { value: "grant", label: "Grant" },
            { value: "rfp", label: "RFP" },
          ]}
        />
      </Group>
      <Group title="Official category">
        <Checks options={facets.categories} values={params.cat} onChange={(cat) => onChange({ cat })} />
      </Group>
      <Group title="Security lifecycle stage">
        <Checks options={facets.stages} values={params.stage} onChange={(stage) => onChange({ stage })} limit={6} />
        <p className="mt-1.5 text-2xs text-ink-3">Rule-based reading of the proposal text.</p>
      </Group>
      <Group title="Funding requested (USD)">
        <Range key={`g${params.gmin}-${params.gmax}`} label="Funding requested" unit="$" min={params.gmin} max={params.gmax} onCommit={(gmin, gmax) => onChange({ gmin, gmax })} />
      </Group>
      <Group title="Funding progress (% raised)">
        <Range key={`f${params.fmin}-${params.fmax}`} label="Funding progress" unit="%" min={params.fmin} max={params.fmax} onCommit={(fmin, fmax) => onChange({ fmin, fmax })} />
      </Group>
      <Group title="Existing product or work">
        <Segmented name="Existing product or work" value={params.existing} options={YN} onChange={(existing) => onChange({ existing })} />
        <p className="mt-1.5 text-2xs text-ink-3">A cited public repository, completed milestone or reachable product page.</p>
      </Group>
      <Group title="Independent evidence">
        <Segmented name="Independent evidence" value={params.evidence} options={YN} onChange={(evidence) => onChange({ evidence })} />
        <p className="mt-1.5 text-2xs text-ink-3">At least one claim verified or partly supported.</p>
      </Group>
      <Group title="Milestones">
        <p className="mb-1 text-xs text-ink-2">Has a completed milestone</p>
        <Segmented name="Has a completed milestone" value={params.done} options={YN} onChange={(done) => onChange({ done })} />
        <p className="mt-2.5 mb-1 text-xs text-ink-2">Adoption milestones (paid on third-party uptake)</p>
        <Segmented
          name="Adoption milestones"
          value={params.adoption}
          onChange={(adoption) => onChange({ adoption })}
          options={[
            { value: "", label: "Any" },
            { value: "has", label: "Has some" },
            { value: "none", label: "None" },
          ]}
        />
      </Group>
      <Group title="Integration requirements">
        <p className="mb-1 text-xs text-ink-2">Planned integrations stated</p>
        <Segmented name="Planned integrations stated" value={params.integrations} options={YN} onChange={(integrations) => onChange({ integrations })} />
        <label className="mt-2.5 block">
          <span className="mb-1 block text-xs text-ink-2">Standard referenced</span>
          <select className={select} value={params.std} onChange={(e) => onChange({ std: e.target.value })}>
            <option value="">Any standard</option>
            {facets.standards.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label} ({s.count})
              </option>
            ))}
          </select>
        </label>
      </Group>
      <Group title="Research status">
        <Segmented
          name="Research status"
          value={params.research}
          onChange={(research) => onChange({ research })}
          options={[
            { value: "", label: "Any" },
            { value: "complete", label: "Complete" },
            { value: "incomplete", label: "Incomplete" },
          ]}
        />
      </Group>
      <Group title="Organization">
        <select className={select} aria-label="Organization" value={params.org} onChange={(e) => onChange({ org: e.target.value })}>
          <option value="">Any organization</option>
          {facets.organizations.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Group>
    </div>
  );
}
