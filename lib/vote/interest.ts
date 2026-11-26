/**
 * "May interest you" (pure, browser-safe). Given the holder's local focus chips and keywords,
 * returns initiatives grouped by the focus they match, alphabetical inside each group, each with
 * the reason it was matched and at least one evidence link. No score, rank or match percentage
 * is computed; an initiative either matches a focus or it does not. Items without an evidence
 * link are left out. Every initiative goes through the same rules.
 */
import { MODE_BY_ID } from "@/lib/skills/modes";
import type { Perspective } from "@/lib/skills/schema";

/**
 * Research mode → official category slugs and keywords. This table is the single source for the
 * mapping; the Methodology page renders it and METHODOLOGY.md reproduces it. Edit it here.
 * Keywords match whole words, case-insensitive, in the official title, summary and standards.
 */
export const FOCUS_MODE_TABLE: readonly { mode: Perspective; categories: readonly string[]; keywords: readonly string[] }[] = [
  { mode: "smart-contract-auditor", categories: ["audits-analysis", "formal-verification", "fuzzing-testing", "compilers"], keywords: ["audit", "static analysis", "fuzzing", "formal verification", "Solidity", "compiler"] },
  { mode: "wallet-engineer", categories: ["wallets-signing", "opsec"], keywords: ["wallet", "signing", "clear signing", "blind signing", "hardware wallet", "multisig"] },
  { mode: "infrastructure-engineer", categories: ["infrastructure", "opsec", "detection-response"], keywords: ["client", "node", "RPC", "monitoring", "reproducible"] },
  { mode: "security-researcher", categories: ["research-education", "detection-response"], keywords: ["threat intelligence", "vulnerability", "exploit", "incident"] },
  { mode: "grant-evaluator", categories: [], keywords: ["maintenance", "maintain", "public good", "open source"] },
  { mode: "funding-analyst", categories: [], keywords: ["bounty", "risk pricing", "insurance", "pricing"] },
  { mode: "ecosystem-researcher", categories: [], keywords: ["standard", "EIP", "ecosystem", "public data"] },
  { mode: "adversarial-reviewer", categories: [], keywords: ["attack", "attacker", "adversarial", "threat model"] },
];

export type FocusId = `cat:${string}` | `mode:${Perspective}`;

export interface FocusChip {
  id: FocusId;
  label: string;
  kind: "category" | "mode";
}

export interface InterestInitiative {
  id: string;
  slug: string;
  label: string;
  title: string;
  summary: string;
  categories: { slug: string; label: string }[];
  standards: string[];
  /** Official initiative page. */
  officialUrl: string;
  /** First independent evidence source for a supported statement, when one exists. */
  evidence: { url: string; title: string } | null;
}

export type ReasonField = "category" | "title" | "summary" | "standards";
export const REASON_FIELD_LABEL: Record<ReasonField, string> = { category: "official category", title: "official title", summary: "official summary", standards: "listed standards" };

export interface InterestReason {
  /** Our wording: "Matches your selected focus: X" or "This may interest you because …". */
  text: string;
  field: ReasonField;
  /** The matched category label, or a short verbatim excerpt of the official text. */
  matched: string;
}

export interface InterestLink {
  kind: "official" | "evidence" | "dossier";
  label: string;
  href: string;
}

export interface InterestItem {
  id: string;
  slug: string;
  label: string;
  reasons: InterestReason[];
  links: InterestLink[];
}

export interface InterestGroup {
  key: string;
  label: string;
  kind: "category" | "mode" | "keyword";
  items: InterestItem[];
}

export function focusChips(categories: readonly { slug: string; label: string }[]): FocusChip[] {
  return [
    ...[...categories].sort((a, b) => a.label.localeCompare(b.label)).map((c) => ({ id: `cat:${c.slug}` as FocusId, label: c.label, kind: "category" as const })),
    ...FOCUS_MODE_TABLE.map((m) => ({ id: `mode:${m.mode}` as FocusId, label: MODE_BY_ID.get(m.mode)?.label ?? m.mode, kind: "mode" as const })),
  ];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whole-word, case-insensitive match; returns a short verbatim excerpt around the hit. */
export function findKeyword(text: string, keyword: string): string | null {
  const k = keyword.trim();
  if (k.length < 2) return null;
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escape(k).replace(/\s+/g, "[\\s-]+")}(?![\\p{L}\\p{N}])`, "iu");
  const m = re.exec(text);
  if (!m) return null;
  // Widen to whole words so the excerpt never starts or ends mid-word.
  let start = Math.max(0, m.index - 50);
  while (start > 0 && !/\s/.test(text[start - 1]!)) start--;
  let end = Math.min(text.length, m.index + m[0].length + 50);
  while (end < text.length && !/\s/.test(text[end]!)) end++;
  return `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ").trim()}${end < text.length ? "…" : ""}`;
}

function keywordReasons(i: InterestInitiative, keyword: string): InterestReason[] {
  const fields: [ReasonField, string][] = [
    ["title", i.title],
    ["summary", i.summary],
    ["standards", i.standards.join(", ")],
  ];
  for (const [field, text] of fields) {
    const excerpt = findKeyword(text, keyword);
    if (excerpt) return [{ text: `This may interest you because the ${REASON_FIELD_LABEL[field]} ${field === "standards" ? "include" : "mentions"} “${keyword.trim()}”.`, field, matched: excerpt }];
  }
  return [];
}

export function linksFor(i: InterestInitiative): InterestLink[] {
  const out: InterestLink[] = [];
  if (i.officialUrl) out.push({ kind: "official", label: "Official initiative page", href: i.officialUrl });
  if (i.evidence) out.push({ kind: "evidence", label: `Evidence found: ${i.evidence.title}`, href: i.evidence.url });
  out.push({ kind: "dossier", label: "Dossier", href: `/initiatives/${i.slug}` });
  return out;
}

/** Evidence links only (official page or independent source); the dossier link does not count. */
export const hasEvidenceLink = (links: readonly InterestLink[]) => links.some((l) => l.kind !== "dossier" && /^https:\/\//.test(l.href));

function reasonsFor(i: InterestInitiative, focus: FocusId): InterestReason[] {
  if (focus.startsWith("cat:")) {
    const c = i.categories.find((x) => `cat:${x.slug}` === focus);
    return c ? [{ text: `Matches your selected focus: ${c.label}`, field: "category", matched: c.label }] : [];
  }
  const row = FOCUS_MODE_TABLE.find((m) => `mode:${m.mode}` === focus);
  if (!row) return [];
  const label = MODE_BY_ID.get(row.mode)?.label ?? row.mode;
  const cats = i.categories.filter((c) => row.categories.includes(c.slug));
  if (cats.length) return [{ text: `Matches your selected focus: ${label}`, field: "category", matched: cats.map((c) => c.label).join(", ") }];
  for (const k of row.keywords) {
    const r = keywordReasons(i, k);
    if (r.length) return [{ ...r[0]!, text: `Matches your selected focus: ${label}. ${r[0]!.text}` }];
  }
  return [];
}

/**
 * Groups in the order of the focus chips, then one group per keyword in the order typed.
 * Inside a group: alphabetical by label. An initiative can appear in more than one group.
 */
export function mayInterest(initiatives: readonly InterestInitiative[], focus: readonly FocusId[], keywords: readonly string[], chips: readonly FocusChip[]): InterestGroup[] {
  const groups: InterestGroup[] = [];
  const build = (reason: (i: InterestInitiative) => InterestReason[]) =>
    initiatives
      .map((i) => ({ i, reasons: reason(i), links: linksFor(i) }))
      .filter((x) => x.reasons.length > 0 && hasEvidenceLink(x.links))
      .map(({ i, reasons, links }) => ({ id: i.id, slug: i.slug, label: i.label, reasons, links }))
      .sort((a, b) => a.label.localeCompare(b.label));
  const chosen = new Set(focus);
  for (const c of chips) {
    if (!chosen.has(c.id)) continue;
    groups.push({ key: c.id, label: c.label, kind: c.kind, items: build((i) => reasonsFor(i, c.id)) });
  }
  const seen = new Set<string>();
  for (const k of keywords) {
    const t = k.trim();
    if (t.length < 2 || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    groups.push({ key: `kw:${t.toLowerCase()}`, label: `Your keyword: ${t}`, kind: "keyword", items: build((i) => keywordReasons(i, t)) });
  }
  return groups;
}
