/**
 * Connections between one badge holder and the initiatives, from public sources only.
 *
 * Groups, in display order: Your organisation, Your repos, Your security area, Public connections.
 * An initiative appears once, in the first group that applies. Inside a group cards are
 * alphabetical. Every card carries one why-line and at least one evidence link; a reason without
 * a public source is never produced.
 */
import type { CardData } from "./card-data";
import { normalizeHandle, normalizeText, type BadgeHolder } from "./badge-holders";

export const GROUP_ORDER = ["organisation", "repos", "area", "public"] as const;
export type GroupKey = (typeof GROUP_ORDER)[number];
export const GROUP_LABEL: Record<GroupKey, string> = {
  organisation: "Your organisation",
  repos: "Your repos",
  area: "Your security area",
  public: "Public connections",
};

export interface EvidenceLink {
  label: string;
  url: string;
}

export interface IndexInitiative {
  card: CardData;
  officialUrl: string;
  /** Recipient, organization and alias names as published. */
  organizations: string[];
  /** Hosts of the organization and recipient websites. */
  hosts: string[];
  category: { slug: string; label: string } | null;
  repos: { fullName: string; url: string }[];
  /** People named in the proposal team section or in team research, with public profile handles. */
  people: { name: string; xHandles: string[]; githubHandles: string[]; sourceUrl: string }[];
  /** Company labels on official pledge records. */
  backers: { company: string; sourceUrl: string }[];
  /** X handles linked from the proposal. */
  linkedXHandles: string[];
}

export interface SearchIndex {
  initiatives: IndexInitiative[];
}

export interface ConnectionCard {
  card: CardData;
  why: string;
  evidence: EvidenceLink[];
}

export interface ConnectionGroup {
  key: GroupKey;
  label: string;
  cards: ConnectionCard[];
}

export const hostOf = (url: string): string => {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).host.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};

function profileHandle(url: string, hosts: RegExp): string | null {
  try {
    const u = new URL(url);
    if (!hosts.test(u.host.replace(/^www\./, ""))) return null;
    const first = u.pathname.split("/").filter(Boolean)[0];
    return first ? first.replace(/^@/, "").toLowerCase() : null;
  } catch {
    return null;
  }
}
export const xHandleOf = (url: string) => profileHandle(url, /^(x|twitter)\.com$/i);
export const githubHandleOf = (url: string) => profileHandle(url, /^github\.com$/i);

const GENERIC_SINGLE = new Set(["labs", "lab", "foundation", "security", "network", "dao", "team", "research", "protocol", "finance", "inc", "ltd", "llc", "the"]);

/** Same organization by normalized name: equal, or one contains the other as whole words (not a lone generic word). */
export function sameOrganisation(a: string, b: string): boolean {
  const x = normalizeText(a);
  const y = normalizeText(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (!short.includes(" ") && (short.length < 5 || GENERIC_SINGLE.has(short))) return false;
  return ` ${long} `.includes(` ${short} `);
}

function githubOwner(raw: string): string {
  const fromUrl = githubHandleOf(/^https?:\/\//i.test(raw) ? raw : `https://${raw.replace(/^@/, "")}`);
  return (fromUrl ?? raw.replace(/^@/, "")).split("/")[0]!.toLowerCase();
}

/** Connections for one holder, grouped and alphabetical. Empty groups are omitted. */
export function connectionsFor(holder: BadgeHolder, index: SearchIndex): ConnectionGroup[] {
  const placed = new Map<string, { group: GroupKey; item: ConnectionCard }>();
  const place = (group: GroupKey, ini: IndexInitiative, why: string, evidence: EvidenceLink[]) => {
    if (placed.has(ini.card.id) || evidence.length === 0) return;
    placed.set(ini.card.id, { group, item: { card: ini.card, why, evidence } });
  };
  const official = (ini: IndexInitiative): EvidenceLink => ({ label: "Official initiative page", url: ini.officialUrl });

  const holderHost = holder.website ? hostOf(holder.website) : "";
  const ghOwner = holder.github ? githubOwner(holder.github) : "";

  if (holder.organisation || holderHost) {
    for (const ini of index.initiatives) {
      const named = holder.organisation ? ini.organizations.find((o) => sameOrganisation(holder.organisation, o)) : undefined;
      if (named) place("organisation", ini, `Your listed organisation, ${holder.organisation}, may match ${named}, named in this initiative. Check the official page.`, [official(ini)]);
      else if (holderHost && ini.hosts.includes(holderHost)) place("organisation", ini, `Your website, ${holderHost}, is the website listed for this initiative's organization.`, [official(ini)]);
    }
  }

  if (ghOwner) {
    for (const ini of index.initiatives) {
      const repo = ini.repos.find((r) => r.fullName.split("/")[0]!.toLowerCase() === ghOwner);
      if (repo) place("repos", ini, `The public repository ${repo.fullName} belongs to the GitHub account you listed, ${ghOwner}.`, [{ label: repo.fullName, url: repo.url }, official(ini)]);
    }
  }

  // Security area: the first official category of every initiative already connected through organisation or repos.
  const areas = new Map<string, { label: string; via: string }>();
  for (const { item } of placed.values()) {
    const ini = index.initiatives.find((x) => x.card.id === item.card.id)!;
    if (ini.category && !areas.has(ini.category.slug)) areas.set(ini.category.slug, { label: ini.category.label, via: ini.card.displayTitle });
  }
  for (const ini of index.initiatives) {
    const a = ini.category ? areas.get(ini.category.slug) : undefined;
    if (a) place("area", ini, `Shares the official category "${a.label}" with ${a.via}, which is linked to you above.`, [official(ini)]);
  }

  const nameKeys = new Set([holder.name, ...holder.aliases].map(normalizeText).filter(Boolean));
  for (const ini of index.initiatives) {
    const person = ini.people.find((p) => nameKeys.has(normalizeText(p.name)) || (holder.xHandle && p.xHandles.includes(holder.xHandle)) || (ghOwner && p.githubHandles.includes(ghOwner)));
    if (person) {
      place("public", ini, `A team member named ${person.name} is listed for this initiative, matching your name or public handle.`, [{ label: "Team source", url: person.sourceUrl }, official(ini)]);
      continue;
    }
    if (holder.xHandle && ini.linkedXHandles.includes(holder.xHandle)) {
      place("public", ini, `The proposal links to the X profile @${holder.xHandle}.`, [official(ini)]);
      continue;
    }
    const backer = holder.organisation ? ini.backers.find((b) => sameOrganisation(holder.organisation, b.company)) : undefined;
    if (backer) place("public", ini, `An official pledge record for this initiative names ${backer.company}, which may match your listed organisation.`, [{ label: "Pledge record", url: backer.sourceUrl }]);
  }

  return GROUP_ORDER.map((key) => ({
    key,
    label: GROUP_LABEL[key],
    cards: [...placed.values()]
      .filter((p) => p.group === key)
      .map((p) => p.item)
      .sort((a, b) => a.card.displayTitle.localeCompare(b.card.displayTitle) || a.card.id.localeCompare(b.card.id)),
  })).filter((g) => g.cards.length > 0);
}
