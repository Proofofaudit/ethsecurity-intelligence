import type { Metadata } from "next";
import Link from "next/link";
import { QuestionsList } from "@/components/initiatives/questions-list";
import { CompareView } from "@/components/research/compare";
import { MilestoneTable } from "@/components/research/milestones";
import { ResearchExplorer, type Facets } from "@/components/research/explorer";
import { parseParams, toFilter, type SP } from "@/components/research/params";
import { HBarList, RatioBar } from "@/components/ui/charts";
import { Block, Note, PageHead } from "@/components/ui/layout";
import { DateTime, Money, Pct } from "@/components/ui/money";
import { SECURITY_PROBLEMS } from "@/lib/domain/taxonomy";
import { loadIntelligence } from "@/lib/intelligence/load";
import { milestoneRows } from "@/lib/intelligence/milestone-rows";
import { QUESTIONS_NOTE, questionsToCheck } from "@/lib/intelligence/questions-to-check";
import { categoryDistribution, changes, compare, coverage, displayName, evidenceCardRows, filterInitiatives, FilterSchema, findInitiative, fundingRelationships } from "@/lib/intelligence/service";
import { meaningfulChanges } from "@/lib/intelligence/what-changed";
import { formatUsd } from "@/lib/util/money";

export const metadata: Metadata = { title: "Initiatives" };
export const dynamic = "force-dynamic";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function InitiativesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const params = parseParams(sp);
  const { dataset: d } = await loadIntelligence();
  const parsed = FilterSchema.safeParse(toFilter(params));
  const filter = parsed.success ? parsed.data : { limit: 100 };
  const result = filterInitiatives(d, filter);
  // Affiliation is read from the official manifest groups already attached to each summary.
  const items = result.items.filter((r) => (params.aff === "" ? true : params.aff === "any" ? r.affiliatedWith.length > 0 : params.aff === "none" ? r.affiliatedWith.length === 0 : r.affiliatedWith.some((g) => g.group === params.aff)));
  const cards = evidenceCardRows(d);
  const groupCounts = new Map<string, number>();
  for (const i of filterInitiatives(d, { limit: 100 }).items) for (const g of i.affiliatedWith) groupCounts.set(g.group, (groupCounts.get(g.group) ?? 0) + 1);

  const facets: Facets = {
    categories: categoryDistribution(d).map((c) => ({ value: c.slug, label: c.label, count: c.count })),
    stages: SECURITY_PROBLEMS.map((p) => ({ value: p.id, label: p.label, count: d.initiatives.filter((i) => i.stages.some((s) => s.stage === p.id)).length })),
    standards: [...new Set(d.initiatives.flatMap((i) => i.standards))].sort().map((s) => ({ value: s, label: s, count: d.initiatives.filter((i) => i.standards.includes(s)).length })),
    organizations: d.organizations
      .filter((o) => d.initiatives.some((i) => i.organizationId === o.id))
      .map((o) => ({ value: o.id, label: o.name, count: d.initiatives.filter((i) => i.organizationId === o.id).length }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    affiliations: [...groupCounts.entries()].map(([value, count]) => ({ value, label: value, count })).sort((a, b) => a.label.localeCompare(b.label)),
    cohortSize: d.initiatives.length,
  };

  // Compare tool (2 to 5 initiatives), driven by ?ids=.
  const raw = one(sp.ids).split(",").map((x) => x.trim().slice(0, 120)).filter(Boolean);
  const found = [...new Map(raw.map((x) => findInitiative(d, x)).filter((x) => !!x).map((i) => [i.id, i])).values()].slice(0, 5);
  const unknown = raw.filter((x) => !findInitiative(d, x));
  const cmp = found.length >= 2 ? compare(d, found.map((i) => i.id)) : null;
  const byId = new Map(d.initiatives.map((i) => [i.id, i]));
  const name = (id: string) => {
    const i = byId.get(id);
    return i ? displayName(d, i) : id;
  };
  const options = d.initiatives.map((i) => ({ id: i.slug, label: displayName(d, i), sub: i.type === "rfp" ? "RFP" : (d.organizations.find((o) => o.id === i.organizationId)?.name ?? null), keywords: i.title }));
  const pairs = d.relationships
    .filter((r) => r.type === "potentially_overlaps")
    .map((r) => ({ id: r.id, a: byId.get(r.from.id), b: byId.get(r.to.id) }))
    .filter((x) => !!x.a && !!x.b)
    .sort((x, y) => name(x.a?.id ?? "").localeCompare(name(y.a?.id ?? "")));

  const questions = questionsToCheck(d);
  const msRows = milestoneRows(d);
  const focus = one(sp.ini) ? findInitiative(d, one(sp.ini)) : undefined;
  const fr = fundingRelationships(d);
  const cov = coverage(d);
  const concentration = fr.concentration;

  const since = one(sp.since);
  const all = changes(d, { since: since || undefined, initiativeIds: focus ? [focus.id] : undefined, limit: 2000 });
  const shown = meaningfulChanges(all);
  const hidden = all.length - shown.length;
  const recent = shown.slice(0, 40);

  const nameOf = (id: string) => name(id);
  const selfNames = [...new Set(fr.selfPledges.map((p) => nameOf(p.initiativeId)))].sort((a, b) => a.localeCompare(b));
  const multiTotal = fr.multiInitiativeBackers.length;

  return (
    <div className="space-y-14">
      <PageHead
        eyebrow={`${d.initiatives.length} initiatives · alphabetical by default`}
        title="Initiatives"
        lede={<p>Every initiative on the ballot, in neutral alphabetical order. Filter by category, type, evidence status or affiliation, and select two to five to compare them side by side.</p>}
        aside={
          <a href="#changes" className="text-xs text-ink-3 hover:text-accent">
            What changed
          </a>
        }
      />

      <ResearchExplorer
        params={params}
        invalid={parsed.success ? null : (parsed.error.issues[0]?.message ?? "Invalid filter")}
        items={items.map((r) => ({ ...r, evidenceCard: cards[r.id] ?? null }))}
        total={items.length}
        sortNote={result.sortNote}
        facets={facets}
      />

      <Block id="compare" title="Compare initiatives" note="Pick two to five. Rows where every initiative has the same value collapse into one line. Every value is copied from the official record or computed from the published dataset." className="scroll-mt-20">
        {unknown.length > 0 && (
          <p role="alert" className="mb-4 border-l-2 border-st-contradicted pl-3 text-sm">
            Not found in the cohort: {unknown.join(", ")}.
          </p>
        )}
        <CompareView
          selected={found.map((i) => i.slug)}
          options={options}
          result={
            cmp && {
              initiatives: cmp.initiatives.map((s) => ({ id: s.id, slug: s.slug, shortTitle: displayName(d, s), title: s.title, organization: s.organization ?? s.recipientTeam, url: s.url })),
              rows: cmp.rows,
              hypotheses: cmp.hypotheses.map((h) => ({ id: h.id, type: h.type, reason: h.reason, a: name(h.from.id), b: name(h.to.id) })),
              methodology: cmp.methodology,
            }
          }
        />
        {found.length < 2 && pairs.length > 0 && (
          <details className="mt-6">
            <summary className="cursor-pointer text-sm font-medium">Pairs flagged as possibly overlapping</summary>
            <p className="mt-1 mb-3 text-xs text-ink-3">Research hypotheses from the collaboration analysis, listed alphabetically. A starting point for comparison, not a finding.</p>
            <ul className="grid gap-x-8 md:grid-cols-2">
              {pairs.map((x) => (
                <li key={x.id} className="border-b border-rule py-2 text-sm">
                  <Link href={`/initiatives?ids=${x.a?.slug},${x.b?.slug}#compare`} className="hover:text-accent">
                    {name(x.a?.id ?? "")} and {name(x.b?.id ?? "")}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        )}
      </Block>

      <Block id="questions" title="Questions to check" note={`Open questions and blind spots in one list, each phrased as a question and listed once. ${QUESTIONS_NOTE}`} className="scroll-mt-20">
        <QuestionsList items={questions} initialInitiative={focus?.slug ?? ""} />
      </Block>

      <Block id="milestones" title="Milestones" note="Every milestone with its budget, status, target month and acceptance criteria. Filter by adoption, completion, criteria and amount." className="scroll-mt-20">
        <MilestoneTable rows={msRows} initialInitiative={focus?.slug ?? ""} initiatives={[...new Map(msRows.map((r) => [r.slug, r.initiative])).entries()].map(([slug, label]) => ({ slug, label }))} />
      </Block>

      <Block id="funding" title="Funding at a glance" note="Who backs what, from the pledge records. Self-pledges are common and legitimate; they are listed so independent support can be seen separately." className="scroll-mt-20">
        <dl className="grid gap-px border-y border-ink bg-rule sm:grid-cols-3 [&>div]:bg-paper [&>div]:px-4 [&>div]:py-4">
          <div>
            <dt className="text-xs text-ink-3">Self-pledges</dt>
            <dd className="num mt-1 text-[22px] leading-7">{fr.selfPledges.length}</dd>
            <dd className="mt-1 text-xs text-ink-3">Backer is the recipient. {selfNames.length > 0 ? selfNames.join(", ") : "None recorded."}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-3">Backers of more than one initiative</dt>
            <dd className="num mt-1 text-[22px] leading-7">{multiTotal}</dd>
            <dd className="mt-1 text-xs text-ink-3">Of {fr.backers.length} distinct backers. Anonymous labels are never merged.</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-3">Top-5 backer share of pledges</dt>
            <dd className="num mt-1 text-[22px] leading-7">
              <Pct value={concentration?.value ?? null} digits={0} reason={concentration?.unavailableReason ?? undefined} />
            </dd>
            <dd className="mt-2">
              <RatioBar value={concentration?.value ?? null} label="Share of all pledged amounts from the five largest backers" />
            </dd>
            <dd className="mt-1 text-xs text-ink-3">
              Of <Money cents={fr.totalPledgedCents} /> pledged in total.
            </dd>
          </div>
        </dl>
        {multiTotal > 0 && (
          <ul className="mt-3 grid gap-x-8 text-sm md:grid-cols-2">
            {[...fr.multiInitiativeBackers]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((b) => (
                <li key={b.backerId} className="border-b border-rule py-1.5">
                  <span className="font-medium">{b.name}</span> <span className="text-xs text-ink-3">backs {b.initiatives.length} initiatives</span>
                </li>
              ))}
          </ul>
        )}
      </Block>

      <Block id="coverage" title="Security coverage map" note="Lifecycle stage of each initiative, from a rule-based reading of its proposal text. Dark: primary stage. Gray: also addresses. A prompt for investigation, not a finding." className="scroll-mt-20">
        <HBarList
          caption="Number of initiatives addressing each security lifecycle stage."
          rows={cov.stages.map((s) => ({ key: s.stage, label: s.label, value: s.totalCount, inner: s.primaryCount, valueLabel: `${s.totalCount}`, sub: `${s.primaryCount} primary`, href: `/initiatives?stage=${s.stage}` }))}
        />
        <Note className="mt-2">Funding by primary category: {categoryDistribution(d).filter((c) => c.primaryCount > 0).map((c) => `${c.label} ${formatUsd(c.goalCents, { compact: true })}`).join(" · ")}.</Note>
      </Block>

      <Block id="changes" title="What changed" note={`Funding, proposal revisions and corrections detected by comparing official snapshots.${hidden > 0 ? ` ${hidden} funding changes under one dollar are hidden.` : ""}${focus ? ` Showing ${displayName(d, focus)} only.` : ""}`} className="scroll-mt-20">
        {recent.length === 0 ? (
          <Note>No changes recorded.</Note>
        ) : (
          <ul className="divide-y divide-rule border-y border-rule">
            {recent.map((c) => {
              const ini = c.initiativeId ? byId.get(c.initiativeId) : undefined;
              return (
                <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-x-4 py-2 text-sm">
                  <span className="min-w-0">
                    {ini ? (
                      <Link href={`/initiatives/${ini.slug}`} className="font-medium hover:text-accent">
                        {ini.shortTitle}
                      </Link>
                    ) : (
                      <span className="font-medium">Cohort</span>
                    )}{" "}
                    <span className="text-ink-2">{c.summary}</span>
                  </span>
                  <DateTime iso={c.detectedAt} className="shrink-0 text-2xs text-ink-3" />
                </li>
              );
            })}
          </ul>
        )}
      </Block>
    </div>
  );
}
