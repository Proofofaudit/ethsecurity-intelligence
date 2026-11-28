/**
 * Round 1 history: which TheDAO / Giveth Round 1 records belong to a ballot initiative or an
 * organization. Pure and deterministic (no network). Matching is conservative:
 *
 * MATCH, only with evidence that can be re-checked on the raw sources:
 *  1. the official proposal links to the project's thedao.fund/transparency/<slug> page
 *     (project level), or to the Giveth project page whose slug is this project's name
 *     (project level);
 *  2. same website: the normalized host (lowercase, no "www.") of the Round 1 "link" equals
 *     the host of the recipient URL, the organization website or another official recipient
 *     URL of the same organization. Shared platforms never match on the host alone: GitHub
 *     needs the same owner (organization level) or owner/repo (project level), X/Twitter the
 *     same account. The same non-root page is project level, the same host organization level;
 *  3. same organization name: a normalized official name, or a name recorded for the same
 *     organization in the curated alias table, equals the Round 1 name or its segment before
 *     ":", " - ", " | " or around " by " (organization level).
 * POSSIBLE ("Possible match: please verify"): only a distinctive name token appears in both
 * (in the Round 1 name or its own website host), without any rule 1 to 3 evidence. Generic words
 * never count. A proposal link to the record's website is added as a note, never as a match:
 * proposals also link to third-party sites they cite.
 *
 * Similarly named entities are never assumed to be the same. Output order is alphabetical
 * by Round 1 project name.
 */
import type { Round1Match, Round1Project, Round1Rule } from "@/lib/domain/schemas";

export const ROUND1_TRANSPARENCY_URL = "https://thedao.fund/transparency";
export const ROUND1_FORUM_URL = "https://forum.giveth.io/t/ethereum-security-qf-round-results-april-23-may-14-2026/2201";
export const ROUND1_EMPTY_TEXT = "No Round 1 funding found in the sources checked.";
export const ROUND1_POSSIBLE_TEXT = "Possible match: please verify";

/** Hosts shared by many unrelated people or projects: never a match on the host alone. */
export const SHARED_HOSTS = [
  "github.com",
  "x.com",
  "twitter.com",
  "giveth.io",
  "qf.giveth.io",
  "medium.com",
  "mirror.xyz",
  "paragraph.com",
  "substack.com",
  "notion.site",
  "docs.google.com",
  "linktr.ee",
  "youtube.com",
  "youtu.be",
  "discord.gg",
  "discord.com",
  "t.me",
  "etherscan.io",
  "huggingface.co",
  "linkedin.com",
  "farcaster.xyz",
  "warpcast.com",
  "gitlab.com",
  "eth.limo",
  "vercel.app",
  "pages.dev",
  "github.io",
  "gitbook.io",
  "hackmd.io",
  "forum.giveth.io",
  "thedao.fund",
];

/** Words that say nothing about identity. A shared generic word is never a possible match. */
export const GENERIC_TOKENS = new Set(
  (
    "security secure securing ethereum open source opensource audit audits auditing safe safes wallet wallets protocol protocols labs lab " +
    "team teams tech technology technologies foundation association cooperative network networks project projects public good goods grant " +
    "grants fund funding development maintenance research smart contract contracts solidity verification verified formal tool tools tooling " +
    "toolkit framework frameworks platform layer data chain onchain blockchain crypto defi web3 transaction transactions signing sign blind " +
    "clear free real time with from for the and your every across through into that this their more like than over under each other " +
    "agent agents agentic based ecosystem community education training incident response monitoring analysis static fuzzing fuzzer threat " +
    "intelligence risk ratings rating standard standards attestations registry clients client users user apps dapps dapp program bounty bug bugs " +
    "infrastructure validator validators hardware engine guard guards checks check testing test tests automated compliance scaling engineering " +
    "decentralized independent assurance archive blob explorer detection exposure leaks leakage leakages protection protecting proof local " +
    "companion production ready mempool encrypted inclusion handbook practical failure failures operational graph pricing price default " +
    "map maintaining knowledge weekly keeps getting faster cost costs paid practice practices emergency freeze lockdown pinned exploit exploits " +
    "fixes fix patches patch coordinate coordinated reports report lost broker fixed rescue rescues whitehat autonomous property packs markets " +
    "market lending what show verify know simulation against display verifiable frontend screening worker workers official releases release " +
    "reproducible reusable workflows triage vulnerability vulnerabilities debugging level source descriptor descriptors tied cover coverage " +
    "intel coalition build maintain hero heroes economic amms stablecoin stablecoins guided checks backtestable evms chains optimism " +
    "inc llc ltd gmbh org collective code github limo vercel pages docs gitbook academy systems media news podcast institute"
  ).split(/\s+/),
);

const SEGMENT_SEPARATORS = /\s*:\s*|\s+-\s+|\s+\|\s+|\s+–\s+/;

export function round1Slug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function round1TransparencyUrl(name: string): string {
  return `${ROUND1_TRANSPARENCY_URL}/${round1Slug(name)}`;
}

/** Case, accent and punctuation insensitive key for names. */
export function nameKey(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "");
}

interface ParsedUrl {
  host: string;
  path: string;
  segments: string[];
}

export function parseUrl(url: string | null | undefined): ParsedUrl | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim().startsWith("http") ? url.trim() : `https://${url.trim()}`);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const segments = u.pathname.split("/").filter(Boolean);
    return { host, path: segments.join("/").toLowerCase(), segments };
  } catch {
    return null;
  }
}

/** A host is shared when it is, or is a subdomain of, a shared platform. */
export function isSharedHost(host: string): boolean {
  return SHARED_HOSTS.some((s) => host === s || host.endsWith(`.${s}`)) && !isOwnSubdomain(host);
}

/** <name>.eth.limo, <user>.github.io and similar subdomains belong to one owner. */
function isOwnSubdomain(host: string): boolean {
  return /\.(eth\.limo|github\.io|vercel\.app|pages\.dev|gitbook\.io)$/.test(host);
}

function nameSegments(name: string): string[] {
  const out = new Set<string>([name]);
  const first = name.split(SEGMENT_SEPARATORS)[0];
  if (first) out.add(first);
  const by = /^(.*?)\s+by\s+(.+)$/i.exec(name);
  if (by?.[1]) out.add(by[1]);
  if (by?.[2]) out.add(by[2]);
  return [...out].map((s) => s.trim()).filter(Boolean);
}

function tokens(text: string): string[] {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && /[a-z]/.test(t) && !GENERIC_TOKENS.has(t));
}

export interface Round1Subject {
  /** Official names; `via` records an alias-table name and the organization it resolves to. */
  names: { name: string; via: { canonicalName: string } | null }[];
  /** Recipient URL of this initiative (eligible for same-page matches). */
  primaryUrls: string[];
  /** Organization website and other official recipient URLs of the same organization. */
  organizationUrls: string[];
  /** Every link in the official proposal (rule 1 only). */
  proposalLinks: string[];
  /** Official proposal page, cited with rule 1 reasons. */
  proposalUrl: string | null;
  /** Initiative title tokens count for possible matches only when a recipient team is named. */
  titles: string[];
}

export interface AliasGroup {
  names: string[];
  canonicalName: string;
}

/** Official names plus every name the curated alias table records for the same organization. */
export function expandNames(official: string[], aliases: AliasGroup[]): Round1Subject["names"] {
  const out = new Map<string, Round1Subject["names"][number]>();
  for (const n of official) if (n.trim()) out.set(nameKey(n), { name: n.trim(), via: null });
  const keys = new Set(out.keys());
  for (const a of aliases) {
    if (!a.names.some((n) => keys.has(nameKey(n))) && !keys.has(nameKey(a.canonicalName))) continue;
    for (const n of [...a.names, a.canonicalName]) if (!out.has(nameKey(n))) out.set(nameKey(n), { name: n, via: { canonicalName: a.canonicalName } });
  }
  return [...out.values()];
}

const PROJECT_RULES = new Set<Round1Rule>(["proposal_links_record", "proposal_links_giveth_project", "same_website_page", "same_github_repo"]);

function sameUrlKey(u: string): string {
  return u.replace(/\/+$/, "").toLowerCase();
}

/** Giveth project slug from giveth.io/project/<slug> (any subdomain), else null. */
export function givethProjectSlug(url: string): string | null {
  const p = parseUrl(url);
  if (!p || !(p.host === "giveth.io" || p.host.endsWith(".giveth.io")) || p.segments[0] !== "project" || !p.segments[1]) return null;
  try {
    return decodeURIComponent(p.segments[1]);
  } catch {
    return p.segments[1];
  }
}

/** Every Round 1 record that belongs to the subject, with the reasons that support it. */
export function matchRound1(projects: readonly Round1Project[], s: Round1Subject): Round1Match[] {
  const out: Round1Match[] = [];
  const names = s.names.filter((n) => nameKey(n.name).length >= 2);
  const subjectTokens = new Map<string, string>();
  for (const n of names) for (const t of tokens(n.name)) subjectTokens.set(t, n.name);
  for (const t of s.titles) for (const tok of tokens(t)) if (!subjectTokens.has(tok)) subjectTokens.set(tok, t);
  const linkKeys = new Set(s.proposalLinks.map(sameUrlKey));

  for (const p of projects) {
    const reasons: Round1Match["reasons"] = [];
    const add = (rule: Round1Rule, text: string, sourceUrls: (string | null | undefined)[]) => {
      if (!reasons.some((r) => r.text === text)) reasons.push({ rule, text, sourceUrls: [...new Set(sourceUrls.filter((u): u is string => !!u))] });
    };
    // Rule 1: the proposal links to this record, or to the Giveth project page with this project's name.
    if (linkKeys.has(sameUrlKey(p.transparencyUrl))) add("proposal_links_record", "The proposal links to this Round 1 record", [s.proposalUrl, p.transparencyUrl]);
    const giveth = s.proposalLinks.find((l) => round1Slug(givethProjectSlug(l) ?? "") === p.slug);
    if (giveth) add("proposal_links_giveth_project", `The proposal links to the Giveth project page with this Round 1 project's name (${giveth})`, [s.proposalUrl, giveth, p.transparencyUrl]);
    // Rule 2: same website.
    const w = parseUrl(p.website);
    if (w) {
      const isX = (h: string) => h === "x.com" || h === "twitter.com";
      for (const [list, isPrimary] of [[s.primaryUrls, true], [s.organizationUrls, false]] as const) {
        for (const raw of list) {
          const u = parseUrl(raw);
          if (!u) continue;
          const src = [raw, p.website, p.transparencyUrl];
          if (isX(w.host) && isX(u.host)) {
            if (w.segments[0] && w.segments[0].toLowerCase() === u.segments[0]?.toLowerCase()) add("same_x_account", `Same X account (@${w.segments[0]})`, src);
            continue;
          }
          if (u.host !== w.host) continue;
          if (w.host === "github.com") {
            const [wo, wr] = [w.segments[0]?.toLowerCase(), w.segments[1]?.toLowerCase()];
            const [uo, ur] = [u.segments[0]?.toLowerCase(), u.segments[1]?.toLowerCase()];
            if (!wo || wo !== uo) continue;
            if (wr && ur && wr === ur && isPrimary) add("same_github_repo", `Same GitHub repository (${w.segments[0]}/${w.segments[1]})`, src);
            else add("same_github_owner", `Same GitHub owner (${w.segments[0]})`, src);
          } else if (isSharedHost(w.host)) {
            continue;
          } else if (isPrimary && w.path && w.path === u.path) {
            add("same_website_page", `Listed under the same website page (${p.website})`, src);
          } else {
            add("same_website", `Listed under the same website (${w.host})`, src);
          }
        }
      }
    }
    // Rule 3: same organization name.
    const segs = nameSegments(p.name).map(nameKey);
    for (const n of names) {
      if (!segs.includes(nameKey(n.name))) continue;
      add(
        "same_organization_name",
        n.via ? `Same organization name through the alias table ("${n.name}" is recorded as ${n.via.canonicalName})` : `Same organization name ("${n.name}")`,
        [s.proposalUrl, p.transparencyUrl],
      );
    }
    if (reasons.length) {
      const level = reasons.some((r) => PROJECT_RULES.has(r.rule)) ? "project" : "organization";
      out.push(toMatch(p, "match", level, reasons));
      continue;
    }
    // Possible: only a distinctive token in common.
    const ownHost = w && !isSharedHost(w.host) ? w.host : null;
    const nameTokens = new Set(tokens(p.name));
    const hostTokens = new Set(ownHost ? tokens(ownHost.split(".").slice(0, -1).join(" ")) : []);
    const shared = [...subjectTokens.keys()].filter((t) => nameTokens.has(t) || hostTokens.has(t)).sort();
    if (!shared.length) continue;
    for (const t of shared) {
      const from = subjectTokens.get(t) as string;
      const shown = new RegExp(t, "i").exec(nameTokens.has(t) ? p.name : from)?.[0] ?? t;
      const where = nameTokens.has(t) ? `the Round 1 name "${p.name}"` : `the Round 1 website ${ownHost}`;
      add("shared_name_token", `The name "${shown}" appears in both ("${from}" and ${where}); this alone does not confirm the same entity`, [s.proposalUrl, p.transparencyUrl]);
    }
    const linked = ownHost ? s.proposalLinks.find((l) => parseUrl(l)?.host === ownHost) : undefined;
    if (linked) add("proposal_links_website", `The proposal links to ${ownHost}, the website listed for this Round 1 record (${linked})`, [s.proposalUrl, linked]);
    const fromName = shared.some((t) => names.some((n) => tokens(n.name).includes(t)));
    out.push(toMatch(p, "possible", fromName ? "organization" : "project", reasons));
  }
  return out.sort((a, b) => a.round1ProjectName.localeCompare(b.round1ProjectName) || a.projectId.localeCompare(b.projectId));
}

function toMatch(p: Round1Project, status: Round1Match["status"], level: Round1Match["level"], reasons: Round1Match["reasons"]): Round1Match {
  return {
    projectId: p.id,
    round1ProjectName: p.name,
    transparencyUrl: p.transparencyUrl,
    website: p.website,
    level,
    status,
    reasons,
    sourceUrls: [...new Set([p.transparencyUrl, ...reasons.flatMap((r) => r.sourceUrls)])],
    checkedAt: p.checkedAt,
  };
}

/** Union of several match lists (an organization and its initiatives), one entry per project. */
export function mergeRound1(lists: readonly Round1Match[][]): Round1Match[] {
  const by = new Map<string, Round1Match>();
  for (const m of lists.flat()) {
    const prev = by.get(m.projectId);
    if (!prev) {
      by.set(m.projectId, structuredClone(m));
      continue;
    }
    if (prev.status === "possible" && m.status === "match") {
      by.set(m.projectId, structuredClone(m));
      continue;
    }
    if (prev.status === "match" && m.status === "possible") continue;
    for (const r of m.reasons) if (!prev.reasons.some((x) => x.text === r.text)) prev.reasons.push(r);
    if (m.level === "project") prev.level = "project";
    prev.sourceUrls = [...new Set([...prev.sourceUrls, ...m.sourceUrls])];
  }
  return [...by.values()].sort((a, b) => a.round1ProjectName.localeCompare(b.round1ProjectName) || a.projectId.localeCompare(b.projectId));
}

interface IniLike {
  id: string;
  url: string;
  title: string;
  shortTitle: string;
  recipientTeam: string | null;
  recipientUrl: string | null;
  organizationId: string | null;
  links: string[];
  textLinks: { url: string }[];
}
interface OrgLike {
  id: string;
  name: string;
  names: string[];
  website: string | null;
  github: string | null;
  initiativeIds: string[];
  anonymous: boolean;
}

function orgUrls(org: OrgLike | undefined, initiatives: readonly IniLike[], exceptIniId: string | null): string[] {
  if (!org) return [];
  const urls = [org.website, org.github ? `https://github.com/${org.github}` : null, ...initiatives.filter((i) => i.organizationId === org.id && i.id !== exceptIniId).map((i) => i.recipientUrl)];
  return [...new Set(urls.filter((u): u is string => !!u))];
}

/** The same subject construction for every initiative. */
export function initiativeSubject(ini: IniLike, org: OrgLike | undefined, initiatives: readonly IniLike[], aliases: AliasGroup[]): Round1Subject {
  const official = [ini.recipientTeam, ...(org && !org.anonymous ? [org.name, ...org.names] : [])].filter((n): n is string => !!n);
  return {
    names: expandNames(official, aliases),
    primaryUrls: ini.recipientUrl ? [ini.recipientUrl] : [],
    organizationUrls: orgUrls(org, initiatives, ini.id),
    proposalLinks: [...new Set([...ini.links.flatMap((l) => l.split(/\s+/)).filter((u) => /^https?:\/\//.test(u)), ...ini.textLinks.map((l) => l.url)])],
    proposalUrl: ini.url,
    titles: ini.recipientTeam ? [ini.shortTitle] : [],
  };
}

/** The same subject construction for every organization (its own names and official URLs). */
export function organizationSubject(org: OrgLike, initiatives: readonly IniLike[], aliases: AliasGroup[]): Round1Subject {
  return {
    names: org.anonymous ? [] : expandNames([org.name, ...org.names], aliases),
    primaryUrls: [],
    organizationUrls: orgUrls(org, initiatives, null),
    proposalLinks: [],
    proposalUrl: null,
    titles: [],
  };
}

/** Matches for every initiative and every organization, from one matcher. */
export function computeRound1Matches(
  projects: readonly Round1Project[],
  initiatives: readonly IniLike[],
  organizations: readonly OrgLike[],
  aliases: AliasGroup[],
): { initiativeMatches: Record<string, Round1Match[]>; organizationMatches: Record<string, Round1Match[]> } {
  const orgs = new Map(organizations.map((o) => [o.id, o]));
  const initiativeMatches: Record<string, Round1Match[]> = {};
  for (const ini of initiatives) initiativeMatches[ini.id] = matchRound1(projects, initiativeSubject(ini, ini.organizationId ? orgs.get(ini.organizationId) : undefined, initiatives, aliases));
  const organizationMatches: Record<string, Round1Match[]> = {};
  for (const o of organizations) {
    const own = matchRound1(projects, organizationSubject(o, initiatives, aliases));
    organizationMatches[o.id] = mergeRound1([own, ...o.initiativeIds.map((id) => initiativeMatches[id] ?? [])]);
  }
  return { initiativeMatches, organizationMatches };
}

