/**
 * 10-minute briefing (Item 12). An ordered, timed reading list taken from the official proposal.
 * Extractive only: every item quotes official text or lists recorded facts, and links to its source.
 * No model runs here and no prose is generated. Pure functions, so the same input always yields the
 * same briefing, and the module is safe to import in the browser.
 */
import { isPrivateContact, urlKey } from "./evidence-card";

export const WORDS_PER_MINUTE = 200;
export const BRIEFING_MINUTES = 10;

export const READING_TIME_RULE = `Reading time is the number of words divided by ${WORDS_PER_MINUTE} words per minute, rounded up to whole minutes, with a minimum of 1 minute per item. The total is the sum of the item times.`;
export const OPTIONAL_RULE = `An item is marked Optional when the items before it already add up to ${BRIEFING_MINUTES} minutes or more.`;
export const BRIEFING_NOTE = "Every item is quoted or listed from the official proposal and its recorded sources. Nothing here is written by a model. The order is the same for every initiative.";

/** Sections in the order of the briefing. Grants carry commitments and team; RFPs carry existing, who and hard_req. A key that is absent is skipped. */
export const SECTION_ORDER = ["why", "in_scope", "out_scope"] as const;
export const SECTION_ORDER_AFTER_MILESTONES = ["commitments", "team", "existing", "who", "hard_req"] as const;

export type LinkType = "repo" | "docs" | "demo" | "audit" | "website" | "link";
export const LINK_TYPE_LABEL: Record<LinkType, string> = { repo: "Repo", docs: "Docs", demo: "Demo", audit: "Audit", website: "Website", link: "Link" };

// ───────────────────────────── Reading time ─────────────────────────────

/** Markdown syntax removed so that only the words a reader sees are counted. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/\[([^\]]*)\]\((?:https?:\/\/)[^)\s]+\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, "")
    .replace(/[*`>]/g, " ");
}

/** Words are whitespace-separated tokens that contain a letter or a digit. A bare URL counts as one word. */
export function wordCount(markdown: string): number {
  return (plainText(markdown).match(/\S+/g) ?? []).filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
}

/** Whole minutes, rounded up, minimum 1. */
export function readingMinutes(words: number): number {
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

// ───────────────────────────── Link types ─────────────────────────────

const CODE_HOSTS = ["github.com", "gitlab.com", "bitbucket.org", "codeberg.org"];
/** First path segments on a code host that are not a repository owner. */
const RESERVED_OWNERS = new Set(["orgs", "sponsors", "marketplace", "features", "topics", "settings", "about", "login", "enterprise", "pricing", "explore", "search", "collections", "events", "apps", "users"]);
/** Hosts of social, chat, video, document and explorer services. A bare address on one of these is not a project website. */
const PLATFORM_HOSTS = ["x.com", "twitter.com", "discord.com", "discord.gg", "discordapp.com", "t.me", "linkedin.com", "youtube.com", "youtu.be", "medium.com", "mirror.xyz", "notion.so", "hackmd.io", "docs.google.com", "drive.google.com", "warpcast.com", "farcaster.xyz", "giveth.io", "etherscan.io", "reddit.com", "facebook.com", "instagram.com", "substack.com", "github.io", "initiatives.thedao.fund", "thedao.fund"];
const AUDIT_SEGMENTS = new Set(["audit", "audits", "audit-reports", "audit-report", "security-audits", "security-audit"]);
const DOCS_LABELS = new Set(["docs", "doc", "documentation", "wiki"]);
const DOCS_HOST_SUFFIXES = ["readthedocs.io", "readthedocs.org", "gitbook.io"];
const DEMO_NAMES = new Set(["demo", "demos", "playground"]);

const hostIs = (host: string, list: readonly string[]) => list.some((h) => host === h || host.endsWith(`.${h}`));

/**
 * Link type from URL structure alone (never from page content or link text). Precedence:
 * audit, repo, demo, docs, website; anything else is "link".
 * - audit: a path segment that is exactly audit, audits, audit-reports, audit-report, security-audit(s)
 *   (on a code host only after the owner/repository part), or a .pdf file name containing "audit", or a host starting with "audits".
 * - repo: github.com, gitlab.com, bitbucket.org or codeberg.org with an owner and a repository in the path.
 * - demo: the first host label or first path segment is demo, demos or playground.
 * - docs: the first host label is docs, doc, documentation or wiki; the host is on readthedocs or gitbook; or the first path segment is docs, doc or documentation.
 * - website: the address has no path (a bare origin) and the host is not a social, chat, video, document or explorer service.
 */
export function classifyLink(url: string): LinkType {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return "link";
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return "link";
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const segs = u.pathname
    .split("/")
    .filter(Boolean)
    .map((s) => {
      try {
        return decodeURIComponent(s).toLowerCase();
      } catch {
        return s.toLowerCase();
      }
    });
  const code = hostIs(host, CODE_HOSTS);
  const label = host.split(".")[0] ?? "";
  const rest = code ? segs.slice(2) : segs;
  const auditPdf = (s: string | undefined) => !!s && s.endsWith(".pdf") && s.includes("audit");
  if (rest.some((s) => AUDIT_SEGMENTS.has(s)) || auditPdf(segs.at(-1)) || (!code && AUDIT_SEGMENTS.has(label))) return "audit";
  if (code) return segs.length >= 2 && !RESERVED_OWNERS.has(segs[0] ?? "") ? "repo" : "link";
  if (DEMO_NAMES.has(label) || DEMO_NAMES.has(segs[0] ?? "")) return "demo";
  if (DOCS_LABELS.has(label) || hostIs(host, DOCS_HOST_SUFFIXES) || ["docs", "doc", "documentation"].includes(segs[0] ?? "")) return "docs";
  if (segs.length === 0 && !hostIs(host, PLATFORM_HOSTS)) return "website";
  return "link";
}

// ───────────────────────────── Briefing model ─────────────────────────────

export interface BriefingSource {
  label: string;
  url: string;
}

export interface BriefingLine {
  text: string;
  /** "heading" starts a group, "bullet" is a list entry. */
  style: "heading" | "bullet" | "plain";
  href?: string;
  /** Where the line comes from, e.g. "Independent evidence". */
  sourceLabel?: string;
}

export interface BriefingLink {
  title: string;
  url: string;
  type: LinkType;
  where: string;
}

export type BriefingBody = { type: "markdown"; markdown: string } | { type: "lines"; lines: BriefingLine[] } | { type: "links"; links: BriefingLink[] };

export type BriefingKind = "summary" | "section" | "milestones" | "links" | "round1" | "evidence_card";

export interface BriefingItem {
  /** Stable across builds: `<initiative id>:<key>`. Used for the local read mark. */
  id: string;
  key: string;
  kind: BriefingKind;
  title: string;
  body: BriefingBody;
  /** At least one official or recorded source, always an https address. */
  sources: BriefingSource[];
  words: number;
  minutes: number;
  /** Minutes of all items before this one. */
  startMinute: number;
  optional: boolean;
}

export interface Briefing {
  initiativeId: string;
  slug: string;
  title: string;
  items: BriefingItem[];
  totalWords: number;
  totalMinutes: number;
  /** Minutes of the items that are not optional. */
  coreMinutes: number;
  optionalCount: number;
  /** Official sections that are not part of the briefing order, named by heading, so the reader knows they exist. */
  otherSections: { key: string; heading: string; url: string }[];
}

export interface BriefingInput {
  initiative: {
    id: string;
    slug: string;
    title: string;
    url: string;
    summary: string;
    sections: { key: string; heading: string; markdown: string }[];
    links: string[];
    textLinks: { url: string; text: string | null; section: string }[];
  };
  milestones: { index: number; name: string; criteria: string[]; link: string | null }[];
  /** Round 1 records matched to the initiative. Empty when none. */
  round1: { name: string; status: "match" | "possible"; totalEth: string | null; progressUpdateUrl: string | null; transparencyUrl: string }[];
  /** Evidence card sections with at least the listed items. */
  card: { title: string; items: { label: string; value: string; link: string | null; sourceName: string; sourceLabel: string; sourceUrl: string; checkedAt: string }[] }[];
  possibleText: string;
}

const isHttps = (u: string | null | undefined): u is string => !!u && /^https:\/\//i.test(u);
const day = (iso: string) => iso.slice(0, 10);

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return url;
  }
}

function bodyText(b: BriefingBody): string {
  if (b.type === "markdown") return b.markdown;
  if (b.type === "lines") return b.lines.map((l) => l.text).join("\n");
  return b.links.map((l) => `${l.title} ${LINK_TYPE_LABEL[l.type]} ${l.where}`).join("\n");
}

/** Links from the official links list and from proposal text, de-duplicated by address, private contacts left out. */
export function briefingLinks(i: BriefingInput["initiative"]): BriefingLink[] {
  const headings = new Map(i.sections.map((s) => [s.key, s.heading]));
  const seen = new Set<string>();
  const out: BriefingLink[] = [];
  const add = (url: string, text: string | null, where: string) => {
    if (!/^https?:\/\//i.test(url) || isPrivateContact(url, text)) return;
    const k = urlKey(url);
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ title: text?.trim() || shortUrl(url), url, type: classifyLink(url), where });
  };
  for (const url of i.links) add(url, null, "Official links list");
  for (const l of i.textLinks) add(l.url, l.text, `Proposal section: ${headings.get(l.section) ?? l.section}`);
  return out;
}

/** Builds the briefing. Items whose source data is missing are left out; nothing is filled in. */
export function buildBriefing(input: BriefingInput): Briefing {
  const ini = input.initiative;
  const proposal: BriefingSource = { label: "Official proposal", url: ini.url };
  const sec = (key: string) => ini.sections.find((s) => s.key === key && s.markdown.trim());
  const drafts: Omit<BriefingItem, "words" | "minutes" | "startMinute" | "optional">[] = [];
  const make = (key: string, kind: BriefingKind, title: string, body: BriefingBody, sources: BriefingSource[]) => {
    const ok = sources.filter((s) => isHttps(s.url));
    if (ok.length === 0) return; // an item without a source link is not shown
    drafts.push({ id: `${ini.id}:${key}`, key, kind, title, body, sources: ok });
  };
  const section = (key: string) => {
    const s = sec(key);
    if (s) make(key, "section", s.heading, { type: "markdown", markdown: s.markdown }, [{ label: `Official proposal, ${s.heading}`, url: `${ini.url}#${key}` }]);
  };

  if (ini.summary.trim()) make("summary", "summary", "Summary", { type: "markdown", markdown: ini.summary }, [proposal]);
  for (const k of SECTION_ORDER) section(k);

  const ms = input.milestones.filter((m) => m.name.trim());
  if (ms.length) {
    const lines: BriefingLine[] = [];
    for (const m of [...ms].sort((a, b) => a.index - b.index)) {
      lines.push({ text: `Milestone ${m.index + 1}: ${m.name}`, style: "heading", href: isHttps(m.link) ? m.link : undefined });
      for (const c of m.criteria) if (c.trim()) lines.push({ text: c, style: "bullet" });
    }
    make("milestones", "milestones", "Milestones and criteria", { type: "lines", lines }, [{ label: "Official proposal, milestones", url: ini.url }]);
  }
  for (const k of SECTION_ORDER_AFTER_MILESTONES) section(k);

  const links = briefingLinks(ini);
  if (links.length) make("links", "links", "Links in the proposal", { type: "links", links }, [{ label: "Official proposal", url: ini.url }]);

  if (input.round1.length) {
    const lines: BriefingLine[] = [];
    for (const r of input.round1) {
      lines.push({ text: r.name, style: "heading", href: r.transparencyUrl });
      if (r.status === "possible") lines.push({ text: input.possibleText, style: "bullet" });
      if (r.totalEth) lines.push({ text: `Total received in Round 1: ${r.totalEth} ETH`, style: "bullet", sourceLabel: "Independent evidence" });
      if (isHttps(r.progressUpdateUrl)) lines.push({ text: "Progress update", style: "bullet", href: r.progressUpdateUrl, sourceLabel: "Independent evidence" });
    }
    make("round1", "round1", "Round 1 history", { type: "lines", lines }, [...new Set(input.round1.map((r) => r.transparencyUrl))].map((url) => ({ label: "Round 1 record", url })));
  }

  const cardSections = input.card.filter((s) => s.items.length);
  if (cardSections.length) {
    const lines: BriefingLine[] = [];
    const sources = new Map<string, BriefingSource>();
    for (const s of cardSections) {
      lines.push({ text: s.title, style: "heading" });
      for (const it of s.items) {
        lines.push({ text: `${it.label}: ${it.value}. Source: ${it.sourceName}, checked ${day(it.checkedAt)}`, style: "bullet", href: it.link ?? it.sourceUrl, sourceLabel: it.sourceLabel });
        if (isHttps(it.sourceUrl) && !sources.has(it.sourceUrl)) sources.set(it.sourceUrl, { label: it.sourceName, url: it.sourceUrl });
      }
    }
    make("evidence_card", "evidence_card", "Evidence card", { type: "lines", lines }, [...sources.values()]);
  }

  let start = 0;
  let totalWords = 0;
  let core = 0;
  const items: BriefingItem[] = drafts.map((d) => {
    const words = wordCount(bodyText(d.body));
    const minutes = readingMinutes(words);
    const optional = start >= BRIEFING_MINUTES;
    const item: BriefingItem = { ...d, words, minutes, startMinute: start, optional };
    start += minutes;
    totalWords += words;
    if (!optional) core += minutes;
    return item;
  });

  const used = new Set<string>([...SECTION_ORDER, ...SECTION_ORDER_AFTER_MILESTONES]);
  return {
    initiativeId: ini.id,
    slug: ini.slug,
    title: ini.title,
    items,
    totalWords,
    totalMinutes: start,
    coreMinutes: core,
    optionalCount: items.filter((i) => i.optional).length,
    otherSections: ini.sections.filter((s) => !used.has(s.key) && s.markdown.trim()).map((s) => ({ key: s.key, heading: s.heading, url: `${ini.url}#${s.key}` })),
  };
}

// ───────────────────────────── Focus chain ─────────────────────────────

/** Initiative ids from the "May interest you" groups, each once. */
export function focusInitiativeIds(groups: readonly { items: readonly { id: string }[] }[]): string[] {
  const seen = new Set<string>();
  for (const g of groups) for (const i of g.items) seen.add(i.id);
  return [...seen];
}

/** Alphabetical by official title (neutral order), then slug. Never ranked. */
export function chainOrder<T extends { title: string; slug: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.title.localeCompare(b.title, "en") || a.slug.localeCompare(b.slug, "en"));
}

export function chainTotalMinutes(briefings: readonly Pick<Briefing, "totalMinutes">[]): number {
  return briefings.reduce((n, b) => n + b.totalMinutes, 0);
}

export function formatMinutes(n: number): string {
  return `${n} min`;
}
