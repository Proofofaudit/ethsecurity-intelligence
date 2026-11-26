import type { Metadata } from "next";
import { PageHead } from "@/components/ui/layout";
import { ResearchExplorer, type Facets } from "@/components/research/explorer";
import { parseParams, toFilter, type SP } from "@/components/research/params";
import { loadIntelligence } from "@/lib/intelligence/load";
import { categoryDistribution, filterInitiatives, FilterSchema } from "@/lib/intelligence/service";
import { SECURITY_PROBLEMS } from "@/lib/domain/taxonomy";

export const metadata: Metadata = { title: "Research" };
export const dynamic = "force-dynamic";

export default async function ResearchPage({ searchParams }: { searchParams: Promise<SP> }) {
  const params = parseParams(await searchParams);
  const { dataset: d } = await loadIntelligence();
  const parsed = FilterSchema.safeParse(toFilter(params));
  const filter = parsed.success ? parsed.data : { limit: 100 };
  const result = filterInitiatives(d, filter);

  const facets: Facets = {
    categories: categoryDistribution(d).map((c) => ({ value: c.slug, label: c.label, count: c.count })),
    stages: SECURITY_PROBLEMS.map((p) => ({ value: p.id, label: p.label, count: d.initiatives.filter((i) => i.stages.some((s) => s.stage === p.id)).length })),
    standards: [...new Set(d.initiatives.flatMap((i) => i.standards))].sort().map((s) => ({ value: s, label: s, count: d.initiatives.filter((i) => i.standards.includes(s)).length })),
    organizations: d.organizations
      .filter((o) => d.initiatives.some((i) => i.organizationId === o.id))
      .map((o) => ({ value: o.id, label: o.name, count: d.initiatives.filter((i) => i.organizationId === o.id).length }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    cohortSize: d.initiatives.length,
  };

  return (
    <>
      <PageHead
        eyebrow="Research"
        title="Find and compare initiatives"
        lede={<p>Search proposal text, organizations, technologies and security problems. Every filter runs against the published dataset. Select up to five initiatives to compare them side by side.</p>}
      />
      <ResearchExplorer
        params={params}
        invalid={parsed.success ? null : (parsed.error.issues[0]?.message ?? "Invalid filter")}
        items={result.items}
        total={result.total}
        sortNote={result.sortNote}
        facets={facets}
      />
    </>
  );
}
