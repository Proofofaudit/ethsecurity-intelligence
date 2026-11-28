/**
 * Organization identity resolution.
 *
 * Merge rules (in order). Two official name spellings refer to the same entity only when:
 *  1. strict key equal: identical after case folding and removing punctuation/whitespace
 *     ("ZKnox" = "ZKNOX"), or
 *  2. same official website: both official records link to the same registrable domain
 *     (or GitHub owner), or the name itself is that domain ("Mab.xyz" ↔ mab.xyz), or
 *  3. a curated alias with cited public evidence (data/curated/aliases.json).
 * Labels that look anonymous ("Anon Hero") are never merged: each pledge stays its own backer.
 * Similar names that fail every rule are recorded as *unconfirmed candidates*, never merged.
 */
import { orgKey } from "@/lib/util/text";

export interface NameRecord {
  name: string;
  url: string | null;
  role: "recipient" | "backer";
  initiativeId: string;
  /** Stable reference of the source row (pledge id or initiative id). */
  ref: string;
}

export interface CuratedAlias {
  names: string[];
  canonicalName: string;
  reason: string;
  sourceUrls: string[];
}

export interface ResolvedEntity {
  id: string;
  name: string;
  names: string[];
  urls: string[];
  domains: string[];
  anonymous: boolean;
  records: NameRecord[];
  resolutions: { name: string; resolution: "exact_normalized" | "same_official_domain" | "curated_with_evidence" | "anonymous_not_merged"; reason: string; sourceUrls: string[] }[];
}

export interface Candidate {
  a: string;
  b: string;
  reason: string;
}

const SHARED_HOSTS = new Set(["x.com", "twitter.com", "github.com", "linkedin.com", "medium.com", "mirror.xyz", "substack.com", "notion.site", "eth.limo", "t.me", "discord.gg", "youtube.com"]);
const TWO_PART_TLDS = new Set(["co.uk", "com.au", "co.in", "com.br", "co.jp", "org.uk"]);

export function strictKey(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "");
}

export function isAnonymousLabel(name: string): boolean {
  return /\b(anon|anonymous|undisclosed|private donor|unknown)\b/i.test(name);
}

/** Registrable-domain identity for a URL; GitHub/X owners become "github.com/<owner>". */
export function identityDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const parts = host.split(".");
    let reg = parts.slice(-2).join(".");
    if (TWO_PART_TLDS.has(reg) && parts.length >= 3) reg = parts.slice(-3).join(".");
    if (host.endsWith("eth.limo")) return host; // ENS names are distinct identities
    if (SHARED_HOSTS.has(reg)) {
      const owner = u.pathname.split("/").filter(Boolean)[0];
      return owner ? `${reg}/${owner.toLowerCase()}` : null;
    }
    return reg;
  } catch {
    return null;
  }
}

/** A name like "Mab.xyz" or "corpus.core" may itself be a domain. */
function nameAsDomain(name: string): string | null {
  const t = name.trim().toLowerCase();
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(t) && /\.(xyz|io|com|org|net|tech|app|eth|dev|ai|fund|run|global|co)$/.test(t)) return identityDomain(t);
  return null;
}

export function resolveIdentities(records: NameRecord[], curated: CuratedAlias[] = [], makeId: (name: string) => string): { entities: ResolvedEntity[]; candidates: Candidate[] } {
  // Union-find over record indices.
  const parent = records.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i] as number)));
  const reasons = new Map<number, { resolution: ResolvedEntity["resolutions"][number]["resolution"]; reason: string; sourceUrls: string[] }>();
  const union = (a: number, b: number, why: { resolution: ResolvedEntity["resolutions"][number]["resolution"]; reason: string; sourceUrls: string[] }) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) {
      parent[rb] = ra;
      if (!reasons.has(b)) reasons.set(b, why);
    }
  };

  const anonymous = records.map((r) => isAnonymousLabel(r.name));
  const byStrict = new Map<string, number>();
  const byDomain = new Map<string, number>();
  records.forEach((r, i) => {
    if (anonymous[i]) return;
    const k = strictKey(r.name);
    const prev = byStrict.get(k);
    if (prev !== undefined) union(prev, i, { resolution: "exact_normalized", reason: `Same name after case/punctuation normalization ("${records[prev]?.name}" = "${r.name}")`, sourceUrls: [] });
    else byStrict.set(k, i);
  });
  records.forEach((r, i) => {
    if (anonymous[i]) return;
    for (const d of [identityDomain(r.url), nameAsDomain(r.name)]) {
      if (!d) continue;
      const prev = byDomain.get(d);
      if (prev !== undefined)
        union(prev, i, {
          resolution: "same_official_domain",
          reason: `Official records for "${records[prev]?.name}" and "${r.name}" point to the same website (${d})`,
          sourceUrls: [records[prev]?.url, r.url].filter((x): x is string => !!x),
        });
      else byDomain.set(d, i);
    }
  });
  for (const c of curated) {
    const keys = new Set(c.names.map(strictKey));
    const idx = records.map((r, i) => (keys.has(strictKey(r.name)) ? i : -1)).filter((i) => i >= 0);
    for (const i of idx.slice(1)) union(idx[0] as number, i, { resolution: "curated_with_evidence", reason: c.reason, sourceUrls: c.sourceUrls });
  }

  const groups = new Map<number, number[]>();
  records.forEach((_, i) => {
    const root = anonymous[i] ? i : find(i);
    groups.set(root, [...(groups.get(root) ?? []), i]);
  });

  const entities: ResolvedEntity[] = [];
  const usedIds = new Set<string>();
  for (const idxs of groups.values()) {
    const recs = idxs.map((i) => records[i] as NameRecord);
    // Prefer the recipient spelling, then the most frequent, then the longest with a URL.
    const counts = new Map<string, number>();
    for (const r of recs) counts.set(r.name.trim(), (counts.get(r.name.trim()) ?? 0) + (r.role === "recipient" ? 10 : 1));
    const curatedName = curated.find((c) => recs.some((r) => c.names.map(strictKey).includes(strictKey(r.name))))?.canonicalName;
    const name = curatedName ?? [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0]?.[0] ?? recs[0]?.name ?? "Unknown";
    const isAnon = idxs.every((i) => anonymous[i]);
    let id = makeId(isAnon ? `${name} ${recs[0]?.ref}` : name);
    while (usedIds.has(id)) id = `${id}-x`;
    usedIds.add(id);
    const urls = [...new Set(recs.map((r) => r.url).filter((u): u is string => !!u))];
    entities.push({
      id,
      name,
      names: [...new Set(recs.map((r) => r.name.trim()))],
      urls,
      domains: [...new Set(urls.map(identityDomain).filter((d): d is string => !!d))],
      anonymous: isAnon,
      records: recs,
      resolutions: idxs.flatMap((i) => {
        if (anonymous[i]) return [{ name: records[i]?.name ?? "", resolution: "anonymous_not_merged" as const, reason: "Anonymous label; not merged with other pledges carrying the same label", sourceUrls: [] }];
        const r = reasons.get(i);
        return r ? [{ name: records[i]?.name ?? "", ...r }] : [];
      }),
    });
  }

  // Unconfirmed candidates: loose key containment between different entities.
  const candidates: Candidate[] = [];
  for (let a = 0; a < entities.length; a++) {
    for (let b = a + 1; b < entities.length; b++) {
      const ea = entities[a] as ResolvedEntity;
      const eb = entities[b] as ResolvedEntity;
      if (ea.anonymous || eb.anonymous) continue;
      const hit = ea.names.some((na) =>
        eb.names.some((nb) => {
          const ka = orgKey(na);
          const kb = orgKey(nb);
          if (ka.length < 4 || kb.length < 4) return false;
          return ka === kb || ka.includes(kb) || kb.includes(ka);
        }),
      );
      if (hit) candidates.push({ a: ea.id, b: eb.id, reason: `Similar names ("${ea.name}" / "${eb.name}") but no shared official website or cited evidence; not merged` });
    }
  }
  entities.sort((x, y) => x.name.localeCompare(y.name));
  return { entities, candidates };
}
