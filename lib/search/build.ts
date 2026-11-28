/** Server-side builder for the public name-search index. Imports the dataset engine, so it is never bundled for the browser. */
import type { Dataset } from "@/lib/domain/schemas";
import type { Logo } from "@/lib/team/logos";
import type { TeamResearchFile } from "@/lib/team/types";
import { normalizeHandle } from "./badge-holders";
import { buildCardData } from "./card-data";
import { githubHandleOf, hostOf, xHandleOf, type IndexInitiative, type SearchIndex } from "./connections";

export function buildSearchIndex(d: Dataset, team: TeamResearchFile | null, logos?: Readonly<Record<string, Logo>>): SearchIndex {
  const cards = new Map(buildCardData(d, team, logos).map((c) => [c.id, c]));
  const orgs = new Map(d.organizations.map((o) => [o.id, o]));
  const initiatives = d.initiatives.map((i): IndexInitiative => {
    const org = i.organizationId ? orgs.get(i.organizationId) : undefined;
    const researched = team?.initiatives.find((t) => t.initiativeId === i.id);
    const people = d.people
      .filter((p) => p.initiativeIds.includes(i.id))
      .map((p) => ({
        name: p.name,
        xHandles: p.publicProfiles.map(xHandleOf).filter((h): h is string => !!h),
        githubHandles: p.publicProfiles.map(githubHandleOf).filter((h): h is string => !!h),
        sourceUrl: p.provenance.sourceUrls[0] ?? i.url,
      }));
    for (const m of researched?.members ?? []) {
      people.push({
        name: m.name,
        xHandles: m.handles.filter((h) => /^(x|twitter)$/i.test(h.platform)).map((h) => normalizeHandle(h.handle)),
        githubHandles: m.handles.filter((h) => /^github$/i.test(h.platform)).map((h) => h.handle.replace(/^@/, "").toLowerCase()),
        sourceUrl: m.handles[0]?.url ?? m.pastWork[0]?.url ?? i.url,
      });
    }
    const links = [...i.links, ...i.textLinks.map((l) => l.url), ...(i.recipientUrl ? [i.recipientUrl] : [])];
    return {
      card: cards.get(i.id)!,
      officialUrl: i.url,
      organizations: [...new Set([...(org ? [org.name, ...org.names] : []), ...(i.recipientTeam ? [i.recipientTeam] : [])])],
      hosts: [...new Set([org?.website, i.recipientUrl].filter((u): u is string => !!u).map(hostOf).filter(Boolean))],
      category: i.categories[0] ?? null,
      repos: d.repositories.filter((r) => r.exists && r.initiativeIds.includes(i.id)).map((r) => ({ fullName: r.fullName, url: r.url })),
      people,
      backers: d.pledges.filter((p) => p.initiativeId === i.id).map((p) => ({ company: p.company, sourceUrl: p.url ?? i.url })),
      linkedXHandles: [...new Set(links.map(xHandleOf).filter((h): h is string => !!h))],
    };
  });
  return { initiatives };
}
