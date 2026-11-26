import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Tag } from "@/components/ui/button";
import { Block, Note, PageHead } from "@/components/ui/layout";
import { Money } from "@/components/ui/money";
import { SECURITY_PROBLEMS } from "@/lib/domain/taxonomy";
import { loadIntelligence } from "@/lib/intelligence/load";
import { coverage, displayName } from "@/lib/intelligence/service";

export const metadata: Metadata = { title: "Security coverage map" };
export const revalidate = 600;

const ONE_TS_URL = "https://ethereum.org/reports/trillion-dollar-security/";

export default async function CoveragePage() {
  const { dataset: d } = await loadIntelligence();
  const cov = coverage(d);
  const max = Math.max(1, ...cov.stages.map((s) => s.totalCount));
  const overlaps = d.relationships.filter((r) => r.type === "potentially_overlaps");
  const byId = new Map(d.initiatives.map((i) => [i.id, i]));
  const basis = (stage: string, id: string, terms: string[]) => {
    const hints = SECURITY_PROBLEMS.find((p) => p.id === stage)?.officialCategoryHints ?? [];
    const cats = (byId.get(id)?.categories ?? []).filter((c) => hints.includes(c.slug)).map((c) => `official category “${c.label}”`);
    const words = terms.filter((t) => t !== "official category").map((t) => `“${t}”`);
    return [...cats, ...(words.length ? [`terms ${words.join(", ")}`] : [])].join("; ");
  };

  return (
    <div className="space-y-10">
      <PageHead
        eyebrow="Research · Security coverage map"
        title="Which parts of the security lifecycle the cohort addresses"
        lede={
          <p>
            Each of the {d.initiatives.length} initiatives is mapped to lifecycle stages by a transparent rule over its proposal text and official categories. The counts describe this ballot only. A stage with few initiatives here may be well served by work outside this round, so low coverage is not evidence that a problem is unsolved.
          </p>
        }
      />

      <section aria-label="Coverage overview">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <caption className="sr-only">Initiatives mapped to each lifecycle stage. Primary means the stage with the most term matches for that initiative.</caption>
            <thead>
              <tr className="border-b border-ink text-left text-2xs tracking-wide text-ink-3 uppercase">
                <th scope="col" className="py-2 pr-4 font-medium">
                  Stage
                </th>
                <th scope="col" className="w-[38%] py-2 pr-4 font-medium">
                  Initiatives (left segment: primary stage)
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">
                  All
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">
                  Primary
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Goal, primary
                </th>
              </tr>
            </thead>
            <tbody>
              {cov.stages.map((s) => (
                <tr key={s.stage} className="border-b border-rule">
                  <th scope="row" className="py-2 pr-4 text-left font-medium">
                    <a href={`#${s.stage}`} className="hover:text-accent">
                      {s.label}
                    </a>
                    <div className="text-2xs font-normal text-ink-3">{s.oneTs.join(" · ")}</div>
                  </th>
                  <td className="py-2 pr-4">
                    <span className="relative block h-2 rounded-xs bg-bar-needed" role="img" aria-label={`${s.totalCount} initiatives, ${s.primaryCount} primary`}>
                      <span className="absolute inset-y-0 left-0 rounded-xs bg-bar-pledged" style={{ width: `${(s.totalCount / max) * 100}%` }} />
                      <span className="absolute inset-y-0 left-0 rounded-xs bg-bar-received" style={{ width: `${(s.primaryCount / max) * 100}%` }} />
                    </span>
                  </td>
                  <td className="num py-2 pr-4 text-right">{s.totalCount}</td>
                  <td className="num py-2 pr-4 text-right">{s.primaryCount}</td>
                  <td className="py-2 text-right">
                    <Money cents={s.primaryGoalCents} compact />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 grid gap-4 text-sm md:grid-cols-2">
          <p>
            <span className="font-medium">Most addressed in this cohort:</span> {cov.most.join(", ")}.
          </p>
          <p>
            <span className="font-medium">Fewest initiatives in this cohort (three or fewer):</span> {cov.fewest.length ? cov.fewest.join(", ") : "none"}. {cov.note}
          </p>
        </div>
      </section>

      <div className="space-y-10">
        {cov.stages.map((s) => {
          const ids = new Set(s.initiatives.map((i) => i.id));
          const stageOverlaps = overlaps.filter((r) => ids.has(r.from.id) && ids.has(r.to.id));
          return (
            <Block
              key={s.stage}
              id={s.stage}
              title={`${s.label} · ${s.totalCount} ${s.totalCount === 1 ? "initiative" : "initiatives"}`}
              href={`/research?stage=${s.stage}`}
              hrefLabel="Filter in Research"
              note={
                <>
                  {s.description} Related Trillion Dollar Security domains: {s.oneTs.join(", ")}.
                </>
              }
            >
              {s.initiatives.length === 0 ? (
                <Note>No initiative in this ballot cohort maps to this stage. That says nothing about work outside the cohort.</Note>
              ) : (
                <ul className="grid grid-cols-1 gap-x-8 md:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
                  {[...s.initiatives]
                    .sort((a, b) => Number(b.primary) - Number(a.primary) || a.shortTitle.localeCompare(b.shortTitle) || a.slug.localeCompare(b.slug))
                    .map((i) => (
                      <li key={i.id} className="border-b border-rule py-2">
                        <div className="flex items-baseline justify-between gap-3">
                          <Link href={`/initiatives/${i.slug}`} className="min-w-0 truncate text-sm font-medium hover:text-accent">
                            {byId.get(i.id) ? displayName(d, byId.get(i.id)!) : i.shortTitle}
                          </Link>
                          {i.primary && <span className="shrink-0 text-2xs text-ink-3">Primary stage</span>}
                        </div>
                        <p className="mt-0.5 text-xs [overflow-wrap:anywhere] text-ink-3">Mapping basis: {basis(s.stage, i.id, i.terms)}</p>
                      </li>
                    ))}
                </ul>
              )}
              {stageOverlaps.length > 0 && (
                <div className="mt-4">
                  <p className="eyebrow mb-1">Potential overlap within this stage (hypotheses)</p>
                  <ul className="space-y-1 text-sm">
                    {stageOverlaps.map((r) => {
                      const a = byId.get(r.from.id);
                      const b = byId.get(r.to.id);
                      return (
                        <li key={r.id} className="flex flex-wrap items-baseline gap-x-2">
                          <span>
                            {a ? displayName(d, a) : r.from.id} and {b ? displayName(d, b) : r.to.id}
                          </span>
                          <Tag className="border-st-partial text-st-partial">Hypothesis</Tag>
                          <Link href={`/research/compare?ids=${a?.slug},${b?.slug}`} className="text-xs text-ink-3 hover:text-accent">
                            Compare
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </Block>
          );
        })}
      </div>

      <Block title="How this map is built" id="method">
        <div className="max-w-[820px] space-y-3 text-sm text-ink-2">
          <p>
            The taxonomy is informed by the Ethereum Foundation&apos;s <ExternalLink href={ONE_TS_URL}>Trillion Dollar Security</ExternalLink> overview, and each stage lists the related domains of that framework. The stages and term lists are this site&apos;s own and are published in the{" "}
            <Link href="/methodology#taxonomy" className="link">
              methodology
            </Link>
            .
          </p>
          <p>
            An initiative maps to a stage when its official category hints at that stage, or when its proposal text contains at least two distinct stage terms with three or more matches in total. An initiative maps to at most four stages; the one with the most matches is its primary stage. This is a rule-based classification, not a verified fact.
          </p>
          <p>Overlap hypotheses come from the collaboration analysis and are shown only where both initiatives map to the stage. They are prompts for investigation, not findings of duplication.</p>
        </div>
      </Block>
    </div>
  );
}
