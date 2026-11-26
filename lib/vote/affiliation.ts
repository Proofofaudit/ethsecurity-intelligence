/**
 * Affiliation and conflict flags (pure, browser-safe).
 *
 * Two independent signals, neither of which hides an initiative:
 *  1. Official: initiatives that share an affiliation group in TheDAO's vote manifest
 *     ("Affiliated with: <other initiatives>"). Only when the manifest is aligned
 *     (vote.groupsAvailable); otherwise nothing is flagged and the UI says why.
 *  2. Personal: the organizations a holder lists under "My affiliations" (kept in the browser)
 *     are matched against each initiative's manifest groups, official recipient team and the
 *     organization's published aliases (the identity table). A match shows "You may be
 *     affiliated" with the matched text. Manual overrides win over the automatic match.
 *
 * Matching rule (documented on the Methodology page):
 *  - Text is folded to lower case without accents and split into words at anything that is not a
 *    letter or digit. Words of one character are dropped.
 *  - Generic words (GENERIC_WORDS) never count on their own: "Labs", "Foundation", "Security",
 *    "Protocol" or "Ethereum Foundation" match nothing unless the whole text equals a target.
 *  - An entry also contributes the text inside and outside parentheses, so
 *    "Security Alliance (SEAL)" is tried as itself, "Security Alliance" and "SEAL".
 *  - A term matches a target when the full texts are equal after removing punctuation, or when
 *    the term's distinctive words appear as a consecutive run in the target's and every other
 *    word of the term is in the target or optional (OPTIONAL_WORDS, or SAME_NAME_OPTIONAL_WORDS
 *    when the target has no word the term lacks). The reverse direction (the
 *    target inside the term) counts only when the target has two or more distinctive words.
 */
import type { Dataset } from "@/lib/domain/schemas";
import { strictKey } from "@/lib/domain/identity";

/** Words that never match on their own. Lower case. Edit here; the Methodology page lists them. */
export const GENERIC_WORDS: readonly string[] = [
  "a",
  "ag",
  "ai",
  "an",
  "and",
  "association",
  "at",
  "audit",
  "audits",
  "by",
  "capital",
  "co",
  "collective",
  "com",
  "company",
  "cooperative",
  "core",
  "corp",
  "dao",
  "digital",
  "eth",
  "ethereum",
  "for",
  "foundation",
  "fund",
  "gmbh",
  "grant",
  "group",
  "in",
  "inc",
  "io",
  "lab",
  "labs",
  "llc",
  "ltd",
  "network",
  "networks",
  "of",
  "on",
  "open",
  "org",
  "project",
  "protocol",
  "protocols",
  "research",
  "sa",
  "security",
  "software",
  "solutions",
  "studio",
  "systems",
  "team",
  "tech",
  "technologies",
  "technology",
  "the",
  "to",
  "ventures",
  "with",
  "xyz",
];
const GENERIC = new Set(GENERIC_WORDS);

/**
 * Generic words that may be added or left out without changing which organization is meant:
 * legal forms ("Ltd", "GmbH"), brand suffixes ("Labs", "Security", "Foundation", "Project",
 * "Network"), "Team", "Research" and short connecting words. So "Nethermind Security" matches
 * "Nethermind" and "Remix Project" matches "Remix". Every other generic word ("Capital",
 * "Ventures", ...) is part of the name when it is present: "Walnut Capital" is not "Walnut".
 * Lower case, a subset of GENERIC_WORDS. Edit here; the Methodology page lists them.
 */
export const OPTIONAL_WORDS: readonly string[] = ["a", "ag", "an", "and", "at", "by", "co", "com", "corp", "for", "foundation", "gmbh", "in", "inc", "io", "lab", "labs", "llc", "ltd", "network", "of", "on", "org", "project", "research", "sa", "security", "team", "the", "to", "with", "xyz"];
const OPTIONAL = new Set(OPTIONAL_WORDS);

/**
 * Generic words that may be added only when the official text has no word the entry lacks:
 * "Kleros DAO" matches "Kleros", but "Alliance DAO" matches neither "Security Alliance (SEAL)"
 * nor "Security Alliance" ("security" is not in the entry). Lower case, a
 * subset of GENERIC_WORDS. Edit here; the Methodology page lists them.
 */
export const SAME_NAME_OPTIONAL_WORDS: readonly string[] = ["dao"];
const SAME_NAME_OPTIONAL = new Set(SAME_NAME_OPTIONAL_WORDS);

export type AffiliationField = "group" | "recipientTeam" | "organization";
export const AFFILIATION_FIELD_LABEL: Record<AffiliationField, string> = {
  group: "manifest affiliation group",
  recipientTeam: "official recipient team",
  organization: "organization alias",
};

export interface AffiliationTarget {
  initiativeId: string;
  field: AffiliationField;
  text: string;
}

export interface AffiliationMatch {
  /** The holder's entry as typed. */
  entry: string;
  field: AffiliationField;
  /** The official text it matched. */
  text: string;
}

export type AffiliationOverride = "mine" | "not_mine";

export interface PeerRef {
  id: string;
  slug: string;
  label: string;
}

export interface SharedGroup {
  group: string;
  /** The other initiatives in the same manifest group (never the initiative itself). */
  peers: PeerRef[];
}

export function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1);
}

/** Words of a text without the generic ones. */
export function distinctiveWords(text: string): string[] {
  return words(text).filter((w) => !GENERIC.has(w));
}

/** The entry itself plus the parts inside and outside parentheses. */
export function entryTerms(entry: string): string[] {
  const t = entry.trim();
  const out = new Set<string>([t]);
  const inside = [...t.matchAll(/\(([^)]*)\)/g)].map((m) => (m[1] ?? "").trim());
  const outside = t.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  for (const x of [...inside, outside]) if (x) out.add(x);
  return [...out];
}

function containsRun(hay: string[], needle: string[]): boolean {
  if (!needle.length || needle.length > hay.length) return false;
  for (let i = 0; i + needle.length <= hay.length; i++) if (needle.every((w, j) => hay[i + j] === w)) return true;
  return false;
}

/**
 * True when `inner` names something inside `outer`: the distinctive words of `inner` appear as a
 * consecutive run in `outer`, and every word of `inner` missing from `outer` is optional
 * (OPTIONAL_WORDS, or SAME_NAME_OPTIONAL_WORDS when every word of `outer` is in `inner`).
 */
function namedWithin(inner: string, outer: string): boolean {
  const iw = distinctiveWords(inner);
  const odw = distinctiveWords(outer);
  if (!iw.length || !containsRun(odw, iw)) return false;
  const ow = new Set(words(outer));
  const inw = new Set(words(inner));
  // "Kleros DAO" names "Kleros"; "Alliance DAO" does not name "Security Alliance".
  const sameName = iw.length === odw.length && [...ow].every((w) => inw.has(w));
  return words(inner).every((w) => ow.has(w) || OPTIONAL.has(w) || (sameName && SAME_NAME_OPTIONAL.has(w)));
}

/** True when one term matches one official text under the rule documented above. */
export function termMatches(term: string, target: string): boolean {
  const a = strictKey(term);
  const b = strictKey(target);
  if (a.length >= 2 && a === b) return true;
  // The holder's term inside the official text ("SEAL" in "SEAL Security Frameworks").
  if (namedWithin(term, target)) return true;
  // The official text inside the holder's term, only when it has two or more distinctive words, so a
  // one-word residue such as "Runtime" (from "Runtime Capital") never matches "Runtime Verification".
  return distinctiveWords(target).length >= 2 && namedWithin(target, term);
}

/**
 * Official texts an entry can match, per initiative: manifest groups (only when the manifest is
 * aligned), the official recipient team, and the recipient organization's canonical name, merged
 * spellings and published aliases (anonymous and unconfirmed candidates excluded).
 */
export function affiliationTargets(d: Dataset): AffiliationTarget[] {
  const out: AffiliationTarget[] = [];
  const seen = new Set<string>();
  const add = (initiativeId: string, field: AffiliationField, text: string | null | undefined) => {
    const t = text?.trim();
    if (!t) return;
    const k = `${initiativeId}|${field}|${strictKey(t)}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ initiativeId, field, text: t });
  };
  for (const i of d.initiatives) {
    if (d.vote.groupsAvailable) for (const g of d.vote.initiativeGroups[i.id] ?? []) add(i.id, "group", g);
    add(i.id, "recipientTeam", i.recipientTeam);
    const org = i.organizationId ? d.organizations.find((o) => o.id === i.organizationId) : undefined;
    if (org && !org.anonymous) {
      add(i.id, "organization", org.name);
      for (const n of org.names) add(i.id, "organization", n);
      for (const a of d.aliases) if (a.organizationId === org.id && a.resolution !== "anonymous_not_merged" && a.resolution !== "candidate_unconfirmed") add(i.id, "organization", a.alias);
    }
  }
  return out;
}

/** Initiative id → matches for the holder's entries. Initiatives without a match are absent. */
export function matchAffiliations(entries: readonly string[], targets: readonly AffiliationTarget[]): Record<string, AffiliationMatch[]> {
  const out: Record<string, AffiliationMatch[]> = {};
  for (const entry of entries) {
    if (!entry.trim()) continue;
    const terms = entryTerms(entry);
    for (const t of targets) {
      if (!terms.some((term) => termMatches(term, t.text))) continue;
      const list = (out[t.initiativeId] ??= []);
      if (!list.some((m) => m.entry === entry && m.field === t.field && m.text === t.text)) list.push({ entry, field: t.field, text: t.text });
    }
  }
  return out;
}

export type AffiliationFlag = { kind: "matched"; matches: AffiliationMatch[] } | { kind: "marked" } | { kind: "dismissed"; matches: AffiliationMatch[] } | null;

/** Combines automatic matches with the holder's manual overrides. */
export function affiliationFlag(id: string, matches: Record<string, AffiliationMatch[]>, overrides: Record<string, AffiliationOverride>): AffiliationFlag {
  const m = matches[id] ?? [];
  const o = overrides[id];
  if (o === "mine") return { kind: "marked" };
  if (o === "not_mine") return m.length ? { kind: "dismissed", matches: m } : null;
  return m.length ? { kind: "matched", matches: m } : null;
}

/** True when the holder should see "You may be affiliated" / "Possibly your own or affiliated". */
export const isFlagged = (f: AffiliationFlag) => f?.kind === "matched" || f?.kind === "marked";

/** "“SEAL” matched manifest affiliation group “SEAL”" for each match, joined. */
export function matchText(matches: readonly AffiliationMatch[]): string {
  const order: AffiliationField[] = ["group", "recipientTeam", "organization"];
  const byEntry = new Map<string, AffiliationMatch[]>();
  for (const m of matches) byEntry.set(m.entry, [...(byEntry.get(m.entry) ?? []), m]);
  return [...byEntry]
    .map(([entry, ms]) => {
      // One official text per field keeps the line short; the organization alias only when nothing else matched.
      const firsts = order.map((f) => ms.find((m) => m.field === f)).filter((m): m is AffiliationMatch => !!m);
      const shown = firsts.length > 1 ? firsts.filter((m) => m.field !== "organization") : firsts;
      return `“${entry}” matched ${shown.map((m) => `${AFFILIATION_FIELD_LABEL[m.field]} “${m.text}”`).join(" and ")}`;
    })
    .join("; ");
}

/** Unique official texts for autocomplete, alphabetical. */
export function affiliationSuggestions(targets: readonly AffiliationTarget[]): string[] {
  const byKey = new Map<string, string>();
  for (const t of targets) if (!byKey.has(strictKey(t.text))) byKey.set(strictKey(t.text), t.text);
  return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}

/**
 * Initiative id → manifest groups it shares with at least one other initiative, with those other
 * initiatives. Empty when the manifest is not aligned. Peers are alphabetical by label.
 */
export function sharedAffiliations(d: Dataset, label: (i: Dataset["initiatives"][number]) => string = (i) => i.shortTitle): Record<string, SharedGroup[]> {
  if (!d.vote.groupsAvailable) return {};
  const members = new Map<string, Dataset["initiatives"]>();
  for (const i of d.initiatives) for (const g of d.vote.initiativeGroups[i.id] ?? []) members.set(g, [...(members.get(g) ?? []), i]);
  const out: Record<string, SharedGroup[]> = {};
  for (const [group, list] of members) {
    if (list.length < 2) continue;
    for (const i of list)
      (out[i.id] ??= []).push({
        group,
        peers: list
          .filter((x) => x.id !== i.id)
          .map((x) => ({ id: x.id, slug: x.slug, label: label(x) }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      });
  }
  for (const v of Object.values(out)) v.sort((a, b) => a.group.localeCompare(b.group));
  return out;
}

/** Distinct peers over all shared groups, alphabetical. */
export function peersOf(groups: readonly SharedGroup[]): PeerRef[] {
  const m = new Map<string, PeerRef>();
  for (const g of groups) for (const p of g.peers) m.set(p.id, p);
  return [...m.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export const AFFILIATED_WITH = "Affiliated with:";
export const MAY_BE_AFFILIATED = "You may be affiliated";
export const MARKED_AFFILIATED = "You marked this as affiliated";
export const POSSIBLY_OWN = "Possibly your own or affiliated";
export const S_TIER_REMINDER = "Reminder: TheDAO's ballot rules limit affiliated initiatives in S-tier. Rule 3 counts the official manifest groups, not the affiliations you list here.";
export const GROUPS_OFF_NOTE = "Affiliation groups are off because the official vote manifest is unavailable or its alignment with the cohort was not confirmed.";
