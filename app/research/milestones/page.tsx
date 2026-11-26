import type { Metadata } from "next";
import { MilestoneTable, type XrayRow } from "@/components/research/milestones";
import { Block, Note, PageHead, Stat } from "@/components/ui/layout";
import { Money, Pct } from "@/components/ui/money";
import { loadIntelligence } from "@/lib/intelligence/load";
import { displayName, findInitiative } from "@/lib/intelligence/service";
import { sumCents } from "@/lib/util/money";

export const metadata: Metadata = { title: "Milestone X-Ray" };
export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | string[] | undefined>>;

/** Criteria terms that point at outside parties. "at least" (a numeric target) is excluded on purpose. */
const THIRD_PARTY_EXCLUDE = new Set(["at least"]);

export default async function MilestonesPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { dataset: d } = await loadIntelligence();
  const iniParam = Array.isArray(sp.ini) ? sp.ini[0] : sp.ini;
  const focus = iniParam ? findInitiative(d, iniParam) : undefined;
  const byId = new Map(d.initiatives.map((i) => [i.id, i]));

  const rows: XrayRow[] = d.milestones
    .map((m) => {
      const ini = byId.get(m.initiativeId);
      return {
        id: m.id,
        slug: ini?.slug ?? "",
        initiative: ini ? displayName(d, ini) : m.initiativeId,
        type: ini?.type ?? "grant",
        index: m.index,
        name: m.name,
        amountCents: m.amountCents,
        share: m.shareOfGoal,
        adoption: m.adoption,
        done: m.done,
        targetMonth: m.targetMonth,
        link: m.link,
        criteria: m.criteria,
        questions: m.questions.map((q) => q.question),
        thirdParty: m.dependencyTerms.filter((t) => !THIRD_PARTY_EXCLUDE.has(t)),
      };
    })
    .sort((a, b) => a.initiative.localeCompare(b.initiative) || a.index - b.index);

  const total = sumCents(d.milestones.map((m) => m.amountCents));
  const adoption = d.milestones.filter((m) => m.adoption);
  const adoptionCents = sumCents(adoption.map((m) => m.amountCents));
  const thirdPartyOnly = rows.filter((r) => !r.adoption && r.thirdParty.length > 0);
  const done = d.milestones.filter((m) => m.done);
  const noTarget = d.milestones.filter((m) => !m.done && !m.targetMonth).length;
  const shares = d.initiatives.map((i) => {
    const ms = d.milestones.filter((m) => m.initiativeId === i.id);
    const t = sumCents(ms.map((m) => m.amountCents));
    return t > 0 ? sumCents(ms.filter((m) => m.adoption).map((m) => m.amountCents)) / t : 0;
  });
  const buckets = [
    { label: "None", test: (x: number) => x === 0 },
    { label: "Under 10%", test: (x: number) => x > 0 && x < 0.1 },
    { label: "10% to under 25%", test: (x: number) => x >= 0.1 && x < 0.25 },
    { label: "25% to under 50%", test: (x: number) => x >= 0.25 && x < 0.5 },
    { label: "50% or more", test: (x: number) => x >= 0.5 },
  ].map((b) => ({ label: b.label, count: shares.filter(b.test).length }));
  const maxBucket = Math.max(1, ...buckets.map((b) => b.count));
  const questionCounts = new Map<string, number>();
  for (const m of d.milestones) for (const q of m.questions) questionCounts.set(q.question, (questionCounts.get(q.question) ?? 0) + 1);

  return (
    <div className="space-y-10">
      <PageHead
        eyebrow="Research · Milestone X-Ray"
        title={`All ${d.milestones.length} milestones across the cohort`}
        lede={<p>Budgets, shares of goal, status, target dates, acceptance criteria and the questions each milestone raises. Questions flag what a reviewer may want to clarify; they are not failures.</p>}
      />

      <section aria-label="Milestone figures">
        <dl className="grid grid-cols-2 gap-px border-y border-ink bg-rule sm:grid-cols-3 xl:grid-cols-6 [&>div]:bg-paper [&>div]:px-4 [&>div]:py-4">
          <Stat label="Milestones" value={<span className="num">{d.milestones.length}</span>} sub={`${d.initiatives.length} initiatives`} />
          <Stat label="Milestone budget" value={<Money cents={total} />} sub="Sum of all milestone amounts" />
          <Stat label="Adoption milestones" value={<span className="num">{adoption.length}</span>} sub="Designated by the applicant" />
          <Stat label="Adoption-dependent budget" value={<Money cents={adoptionCents} />} sub={<Pct value={total ? adoptionCents / total : null} />} />
          <Stat label="Marked complete" value={<span className="num">{done.length}</span>} sub="In the official record" />
          <Stat label="No target month" value={<span className="num">{noTarget}</span>} sub="Open milestones without a date" />
        </dl>
      </section>

      <div className="grid gap-10 lg:grid-cols-2 [&>*]:min-w-0">
        <Block title="Adoption analysis" note="Which milestones depend on third-party cooperation. Adoption milestones are paid only when outside parties adopt the work.">
          <div className="space-y-4 text-sm">
            <p>
              <span className="num">{adoption.length}</span> of <span className="num">{d.milestones.length}</span> milestones are designated adoption milestones, holding <Money cents={adoptionCents} /> of <Money cents={total} />. A further{" "}
              <span className="num">{thirdPartyOnly.length}</span> delivery milestones have acceptance criteria that mention outside parties (for example &ldquo;integrat&hellip;&rdquo;, &ldquo;wallets&rdquo; or &ldquo;merged into&rdquo;).
            </p>
            <figure>
              <figcaption className="eyebrow mb-2">Initiatives by adoption-dependent share of milestone budget</figcaption>
              <ul className="space-y-1.5">
                {buckets.map((b) => (
                  <li key={b.label} className="grid grid-cols-[9rem_1fr_2.5rem] items-center gap-3 text-xs">
                    <span className="text-ink-2">{b.label}</span>
                    <span className="relative block h-2 rounded-xs bg-bar-needed" aria-hidden="true">
                      <span className="absolute inset-y-0 left-0 rounded-xs bg-bar-received" style={{ width: `${(b.count / maxBucket) * 100}%` }} />
                    </span>
                    <span className="num text-right">{b.count}</span>
                  </li>
                ))}
              </ul>
            </figure>
          </div>
        </Block>
        <Block title="Questions raised by the milestone rules" note="Each rule is applied identically to every milestone. Counts are milestones.">
          <ul className="divide-y divide-rule text-sm">
            {[...questionCounts.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([q, n]) => (
                <li key={q} className="flex items-baseline justify-between gap-4 py-1.5">
                  <span className="text-ink-2">{q}</span>
                  <span className="num shrink-0">{n}</span>
                </li>
              ))}
          </ul>
        </Block>
      </div>

      <section aria-labelledby="table-h">
        <h2 id="table-h" className="border-t border-ink pt-3 text-md font-semibold">
          Cross-initiative milestone table
        </h2>
        <Note className="mt-1 mb-3">Default order: Alphabetical (neutral), by initiative, then milestone order. Column headers sort. Open a milestone name for its criteria and questions.</Note>
        <MilestoneTable rows={rows} initialInitiative={focus?.slug ?? ""} initiatives={[...new Map(rows.map((r) => [r.slug, r.initiative])).entries()].map(([slug, label]) => ({ slug, label }))} />
      </section>
    </div>
  );
}
