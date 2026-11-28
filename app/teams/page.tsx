import type { Metadata } from "next";
import Link from "next/link";
import { GraphExplorer } from "@/components/graph/explorer";
import { RELATION_LABEL, type EdgeType } from "@/components/graph/labels";
import { Block, Note, PageHead } from "@/components/ui/layout";
import { entityExists } from "@/lib/api/entity";
import { EntityType } from "@/lib/domain/schemas";
import { SECURITY_PROBLEMS } from "@/lib/domain/taxonomy";
import { loadIntelligence } from "@/lib/intelligence/load";
import { displayName, findInitiative } from "@/lib/intelligence/service";
import { loadTeamResearchFile } from "@/lib/team/load";

export const metadata: Metadata = { title: "Teams" };
export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function TeamsPage({ searchParams }: { searchParams: SP }) {
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

  const file = loadTeamResearchFile();
  const research = new Map((file?.initiatives ?? []).map((t) => [t.initiativeId, t]));
  const people = [...d.people].sort((a, b) => a.name.localeCompare(b.name));
  const cards = [...d.initiatives]
    .sort((a, b) => a.title.localeCompare(b.title, "en") || (a.id < b.id ? -1 : 1))
    .map((i) => ({ ini: i, team: research.get(i.id) ?? null, who: org(i.organizationId) ?? i.recipientTeam }));

  return (
    <div className="space-y-12">
      <PageHead
        eyebrow="Teams · People map"
        title={rootLabel ? `Relationships of ${rootLabel}` : "Who is behind the initiatives"}
        lede={
          <p>
            Start from a person, an organization or an initiative and expand step by step. Solid lines are backed by official records or observed evidence. Dotted lines are stated in proposal text. Dashed lines are inferred by a rule and are research prompts, not facts.
          </p>
        }
      />
      {invalid && (
        <p role="alert" className="-mt-4 border-l-2 border-st-contradicted pl-3 text-sm">
          That entity is not in the published dataset. Choose another starting point below.
        </p>
      )}
      <section aria-label="People map" className="-mt-2">
        <GraphExplorer key={root?.key ?? "none"} root={root} options={options} datasetRelationCounts={[...relCounts.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => RELATION_LABEL[a.type].localeCompare(RELATION_LABEL[b.type]))} />
        {!root && people.length > 0 && (
          <div className="mt-6">
            <p className="eyebrow mb-2">Start from a public contributor</p>
            <ul className="grid grid-cols-2 gap-x-6 text-sm sm:grid-cols-3 lg:grid-cols-4">
              {people.map((p) => (
                <li key={p.id} className="border-b border-rule py-1.5">
                  <Link href={`/teams?type=person&id=${p.id}`} className="hover:text-accent">
                    {p.name}
                  </Link>
                </li>
              ))}
            </ul>
            <Note className="mt-2">Only people who publish a public profile in a proposal appear here. Names come from the applicants&apos; own text.</Note>
          </div>
        )}
      </section>

      <Block id="teams" title="Teams" note="One card per initiative, alphabetical. Team research is added initiative by initiative. A card that says Not yet researched has not been checked, which is not a finding about the team.">
        <ul className="grid gap-x-8 gap-y-0 md:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0" data-testid="team-cards">
          {cards.map(({ ini, team, who }) => (
            <li key={ini.id} className="border-b border-rule py-3" data-testid="team-card">
              <Link href={`/initiatives/${ini.slug}`} className="font-medium hover:text-accent">
                {displayName(d, ini)}
              </Link>
              <p className="text-xs text-ink-3">{who ?? "Request for proposals, no designated recipient"}</p>
              {team ? (
                <div className="mt-2 space-y-1 text-xs text-ink-2">
                  {team.organization && <p>{team.organization.summary}</p>}
                  <p className="num">
                    {team.members.length} {team.members.length === 1 ? "team member" : "team members"} · {team.deliveryTimeline.length} past {team.deliveryTimeline.length === 1 ? "grant" : "grants"} · {team.claimChecks.length} {team.claimChecks.length === 1 ? "claim" : "claims"} checked
                  </p>
                  {team.members.length > 0 && <p>{team.members.map((m) => m.name).join(", ")}</p>}
                </div>
              ) : (
                <p className="mt-2 text-xs text-ink-3">Not yet researched</p>
              )}
            </li>
          ))}
        </ul>
      </Block>
    </div>
  );
}
