import type { Metadata } from "next";
import Link from "next/link";
import { GraphExplorer } from "@/components/graph/explorer";
import { ENTITY_LABEL, RELATION_LABEL, type EdgeType } from "@/components/graph/labels";
import { PageHead } from "@/components/ui/layout";
import { entityExists } from "@/lib/api/entity";
import { EntityType } from "@/lib/domain/schemas";
import { SECURITY_PROBLEMS } from "@/lib/domain/taxonomy";
import { loadIntelligence } from "@/lib/intelligence/load";
import { findInitiative } from "@/lib/intelligence/service";

export const metadata: Metadata = { title: "Relationship graph" };
export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function GraphPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { dataset: d } = await loadIntelligence();
  const rawType = one(sp.type);
  const rawId = one(sp.id).slice(0, 120);
  const parsed = EntityType.safeParse(rawType === "backer" ? "organization" : rawType);
  let root: { type: EntityType; id: string; key: string } | null = null;
  let invalid = false;
  if (parsed.success && rawId) {
    const id = parsed.data === "initiative" ? (findInitiative(d, rawId)?.id ?? rawId) : rawId;
    if (entityExists(d, parsed.data, id)) root = { type: parsed.data, id, key: `${parsed.data}:${id}` };
    else invalid = true;
  } else if (rawType || rawId) invalid = true;

  const org = (id: string | null) => (id ? d.organizations.find((o) => o.id === id)?.name : null);
  const standards = [...new Set(d.initiatives.flatMap((i) => i.standards))].sort();
  const options = [
    ...d.initiatives.map((i) => ({ id: `initiative:${i.id}`, label: i.shortTitle, sub: `Initiative${org(i.organizationId) ? ` · ${org(i.organizationId)}` : ""}`, keywords: i.title })),
    ...d.organizations.map((o) => ({ id: `organization:${o.id}`, label: o.name, sub: o.anonymous ? "Anonymous label" : o.kind === "backer" ? "Backer" : o.kind === "both" ? "Recipient and backer" : "Organization", keywords: o.names.join(" ") })),
    ...SECURITY_PROBLEMS.map((p) => ({ id: `problem:${p.id}`, label: p.label, sub: "Security problem", keywords: p.description })),
    ...standards.map((s) => ({ id: `standard:${s}`, label: s, sub: "Standard" })),
    ...d.repositories.filter((r) => r.exists).map((r) => ({ id: `repository:${r.id}`, label: r.fullName, sub: "Repository" })),
    ...d.people.map((p) => ({ id: `person:${p.id}`, label: p.name, sub: p.role ?? "Public contributor" })),
    ...d.products.map((p) => ({ id: `product:${p.id}`, label: p.title ?? p.name, sub: "Product", keywords: p.url })),
  ];
  const relCounts = new Map<EdgeType, number>(Object.keys(RELATION_LABEL).filter((k) => k !== "has_milestone").map((k) => [k as EdgeType, 0]));
  for (const r of d.relationships) relCounts.set(r.type, (relCounts.get(r.type) ?? 0) + 1);
  const rootLabel = root ? (options.find((o) => o.id === root.key)?.label ?? root.id) : null;

  return (
    <>
      <PageHead
        eyebrow="Research · Connected intelligence"
        title={rootLabel ? `Relationships of ${rootLabel}` : "Relationship graph"}
        lede={
          <p>
            Start from one entity and expand step by step. Solid lines are backed by official records or observed evidence. Dotted lines are stated in proposal text. Dashed lines are inferred by a rule and are research prompts, not facts.
          </p>
        }
      />
      {invalid && (
        <p role="alert" className="mb-4 border-l-2 border-st-contradicted pl-3 text-sm">
          That entity is not in the published dataset. Choose another starting point below.
        </p>
      )}
      <GraphExplorer key={root?.key ?? "none"} root={root} options={options} datasetRelationCounts={[...relCounts.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => RELATION_LABEL[a.type].localeCompare(RELATION_LABEL[b.type]))} />
      {!root && (
        <div className="mt-8 grid gap-10 md:grid-cols-2">
          <section className="border-t border-ink pt-3">
            <h2 className="text-md font-semibold">Start from a security problem</h2>
            <ul className="mt-2 divide-y divide-rule text-sm">
              {SECURITY_PROBLEMS.map((p) => (
                <li key={p.id} className="py-1.5">
                  <Link href={`/research/graph?type=problem&id=${p.id}`} className="hover:text-accent">
                    {p.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <section className="border-t border-ink pt-3">
            <h2 className="text-md font-semibold">Start from a standard</h2>
            <p className="mt-1 text-xs text-ink-3">Standards referenced in proposal text, with the number of initiatives that mention each.</p>
            <ul className="mt-2 grid grid-cols-2 gap-x-6 text-sm sm:grid-cols-3">
              {standards.map((s) => (
                <li key={s} className="border-b border-rule py-1.5">
                  <Link href={`/research/graph?type=standard&id=${s}`} className="hover:text-accent">
                    {s} <span className="num text-xs text-ink-3">{d.initiatives.filter((i) => i.standards.includes(s)).length}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
      <p className="mt-8 text-xs text-ink-3">
        Entity types: {Object.values(ENTITY_LABEL).filter((l) => !["Backer", "Technology", "Integration"].includes(l)).join(", ")}. Backers are organizations with pledge records. Milestones are hidden by default; enable them under Entity types after the map loads.
      </p>
    </>
  );
}
