import type { Metadata } from "next";
import Link from "next/link";
import { CompareView } from "@/components/research/compare";
import { PageHead } from "@/components/ui/layout";
import { loadIntelligence } from "@/lib/intelligence/load";
import { compare, displayName, findInitiative } from "@/lib/intelligence/service";

export const metadata: Metadata = { title: "Compare initiatives" };
export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function ComparePage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const raw = (Array.isArray(sp.ids) ? sp.ids.join(",") : (sp.ids ?? "")).split(",").map((x) => x.trim().slice(0, 120)).filter(Boolean);
  const { dataset: d } = await loadIntelligence();
  const found = [...new Map(raw.map((x) => findInitiative(d, x)).filter((x) => !!x).map((i) => [i.id, i])).values()].slice(0, 5);
  const unknown = raw.filter((x) => !findInitiative(d, x));
  const result = found.length ? compare(d, found.map((i) => i.id)) : null;
  const options = d.initiatives.map((i) => ({ id: i.slug, label: displayName(d, i), sub: i.type === "rfp" ? "RFP" : (d.organizations.find((o) => o.id === i.organizationId)?.name ?? null), keywords: i.title }));
  const byId = new Map(d.initiatives.map((i) => [i.id, i]));
  const name = (id: string) => {
    const i = byId.get(id);
    return i ? displayName(d, i) : id;
  };
  const suggestions = d.relationships
    .filter((r) => r.type === "potentially_overlaps")
    .map((r) => ({ id: r.id, a: byId.get(r.from.id), b: byId.get(r.to.id) }))
    .filter((x) => x.a && x.b)
    .sort((x, y) => name(x.a?.id ?? "").localeCompare(name(y.a?.id ?? "")));

  return (
    <>
      <PageHead
        eyebrow="Research · Comparison"
        title={found.length >= 2 ? found.map((i) => displayName(d, i)).join(" · ") : "Compare initiatives side by side"}
        lede={<p>Pick two to five initiatives. Rows where every initiative has the same value collapse into one line, so the differences stand out. Every value is copied from the official record or computed from the published dataset.</p>}
      />
      {unknown.length > 0 && (
        <p role="alert" className="mb-4 border-l-2 border-st-contradicted pl-3 text-sm">
          Not found in the cohort: {unknown.join(", ")}.
        </p>
      )}
      <CompareView
        selected={found.map((i) => i.slug)}
        options={options}
        result={
          result && {
            initiatives: result.initiatives.map((s) => ({ id: s.id, slug: s.slug, shortTitle: displayName(d, s), title: s.title, organization: s.organization ?? s.recipientTeam, url: s.url })),
            rows: result.rows,
            hypotheses: result.hypotheses.map((h) => ({ id: h.id, type: h.type, reason: h.reason, a: name(h.from.id), b: name(h.to.id) })),
            methodology: result.methodology,
          }
        }
      />
      {found.length < 2 && suggestions.length > 0 && (
        <section className="mt-10 border-t border-ink pt-3">
          <h2 className="text-md font-semibold">Pairs flagged as possibly overlapping</h2>
          <p className="mt-1 mb-3 text-xs text-ink-3">Research hypotheses from the collaboration analysis, listed alphabetically. A starting point for comparison, not a finding.</p>
          <ul className="grid gap-x-8 md:grid-cols-2">
            {suggestions.map((x) => (
              <li key={x.id} className="border-b border-rule py-2 text-sm">
                <Link href={`/research/compare?ids=${x.a?.slug},${x.b?.slug}`} className="hover:text-accent">
                  {name(x.a?.id ?? "")} and {name(x.b?.id ?? "")}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
