import type { Metadata } from "next";
import { WhatIfLab, type LabInitiative } from "@/components/research/what-if";
import { PageHead } from "@/components/ui/layout";
import { loadIntelligence } from "@/lib/intelligence/load";
import { displayName, findInitiative } from "@/lib/intelligence/service";

export const metadata: Metadata = { title: "What-if laboratory" };
export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function WhatIfPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { dataset: d } = await loadIntelligence();
  const raw = (Array.isArray(sp.ids) ? sp.ids.join(",") : (sp.ids ?? "")).split(",").map((x) => x.trim()).filter(Boolean);
  const initial = [...new Set(raw.map((x) => findInitiative(d, x)?.slug).filter((x): x is string => !!x))].slice(0, 55);
  const initiatives: LabInitiative[] = d.initiatives
    .map((i) => ({
      id: i.id,
      slug: i.slug,
      label: displayName(d, i),
      sub: i.type === "rfp" ? "RFP" : (d.organizations.find((o) => o.id === i.organizationId)?.name ?? null),
      standards: d.relationships.filter((r) => r.from.id === i.id && r.type === "depends_on" && r.to.type === "standard").map((r) => r.to.id),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const byId = new Map(d.initiatives.map((i) => [i.id, i]));
  const hypotheses = d.relationships
    .filter((r) => r.type === "potentially_overlaps" || r.type === "potentially_complements")
    .map((r) => ({ id: r.id, a: byId.get(r.from.id)?.slug ?? "", b: byId.get(r.to.id)?.slug ?? "", kind: r.type }));

  return (
    <>
      <PageHead
        eyebrow="Research · What-if laboratory"
        title="Explore funding and delivery assumptions"
        lede={
          <p>
            Choose initiatives and change the assumptions. Every figure is deterministic arithmetic over the published funding and milestone records and your inputs. The results show what follows from your assumptions; they do not predict votes, funding or delivery.
          </p>
        }
      />
      <WhatIfLab initiatives={initiatives} hypotheses={hypotheses} initial={initial} />
      <section className="mt-12 border-t border-ink pt-3">
        <h2 className="text-md font-semibold">Method and limits</h2>
        <ul className="mt-2 max-w-[860px] list-disc space-y-1 pl-5 text-sm text-ink-2">
          <li>Secured funding = confirmed donations + outstanding pledges × your conversion rate + any alternative funding you enter. Received pledges are already inside donations and are counted once.</li>
          <li>Gap = scope − secured, never below zero. Scope is the goal, or the goal minus open adoption milestones when you exclude them.</li>
          <li>The budget is applied to gaps in the order you list the initiatives. Reorder them to see a different allocation. The order is your choice, not a recommendation.</li>
          <li>Delays add months to the stated duration. Adoption delays apply only to initiatives with open adoption milestones. Initiatives without a stated duration show no adjusted duration.</li>
          <li>Unavailable standards, unconfirmed integrations and assumed collaborations change no dollar figure. They mark which initiatives and milestones depend on that assumption, because the records do not support a numeric effect.</li>
          <li>No voting simulation is offered. TheDAO&apos;s official voting rules have not been independently verified for this site, and votes are cast only on TheDAO&apos;s own platform.</li>
        </ul>
      </section>
    </>
  );
}
