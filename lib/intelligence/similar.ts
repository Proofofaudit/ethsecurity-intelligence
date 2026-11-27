/**
 * Similar initiatives and possible overlap (Item 10, method similar@1). Deterministic, no model.
 *
 * For every pair of cohort initiatives we look for five kinds of signal:
 *  - category: the pair shares at least one official category (weak);
 *  - affiliation_group: the pair shares an affiliation group in TheDAO's vote manifest (strong);
 *  - keywords: two-word phrases that both proposals use in their official "why" and "in_scope"
 *    sections, after removing stopwords, proposal boilerplate and phrases that more than
 *    KEYWORD_MAX_INITIATIVES initiatives use (strong from KEYWORD_STRONG_MIN phrases, weak below);
 *  - technology: named standards (ERC, EIP, RIP numbers) and technologies from TECHNOLOGIES that
 *    both proposals name in those sections (strong);
 *  - backer: a public backer that pledged to both (official pledges, anonymous backers excluded) (strong).
 *
 * A pair is shown only when it has text evidence (a keyword or technology signal, each with one
 * verbatim sentence from each proposal) and it is not a single weak signal. Labels:
 *  - "Same organization" when both initiatives have the same recipient organization;
 *  - "Possible overlap" when they share an official category;
 *  - "Possible complement" otherwise.
 * Every pair is a research hypothesis, not a finding. No score is computed or shown; pairs are
 * ordered alphabetically by title. The same input always gives the same output, whatever the
 * order of the input arrays.
 */
import type { Initiative, Organization, Pledge } from "@/lib/domain/schemas";
import { sentences } from "@/lib/util/text";

export const SIMILAR_METHOD_VERSION = "similar@1";
/** Official proposal sections scanned for keywords and technologies, in this order. */
export const SIMILAR_SECTIONS = ["why", "in_scope"] as const;
export const SIMILAR_THRESHOLDS = {
  /** A phrase used by more initiatives than this is too common to count. */
  keywordMaxInitiatives: 5,
  /** Shared phrases needed for a strong keyword signal. */
  keywordStrongMin: 2,
} as const;

export const HYPOTHESIS_NOTICE = "This is a research hypothesis, not a finding";
export const SIMILAR_LABELS = ["Possible overlap", "Possible complement", "Same organization"] as const;
export type SimilarLabel = (typeof SIMILAR_LABELS)[number];
export type SimilarSignalKind = "category" | "affiliation_group" | "keywords" | "technology" | "backer";
export type SignalStrength = "strong" | "weak";

/** Words that never start or end a keyword phrase. Lower case. Edit here; METHODOLOGY.md lists the rule. */
export const KEYWORD_STOPWORDS: readonly string[] = (
  "a about above across after again against all almost also although always among an and another any are around as at away back be because been before being below between both but by can cannot could did do does doing done down during each either else even ever every few for from further get gets getting had has have having here how however if in into is it its itself just less like made make makes making many may more most much must near need needs never new next no nor not now of off often on once one only onto or other others our out over own per perhaps rather really same several shall should since so some still such than that the their them themselves then there these they this those though through thus to too two under until up upon us use used uses using very via was way ways we well were what when where whether which while who whom whose why will with within without would yet you your three four five first second third last least " +
  // Generic verbs, adjectives and amounts that pair with anything.
  "able already approve approved assess based better billion come comes companion current currently dollar dollars etc help helps helping identify include includes including keep keeps kept million outside potential propose proposed provide provides providing real relevant result resulting results routine run running runs simple thousand trillion " +
  // Proposal and program wording.
  "applicant fund funded funding grant grants initiative initiatives milestone milestones proposal proposals rfp rfps thedao"
).split(" ");
const STOP = new Set(KEYWORD_STOPWORDS);

/**
 * Generic words of this cohort: a phrase made only of these words ("ethereum security",
 * "smart contracts", "security teams") does not count. Lower case. Edit here.
 */
export const GENERIC_KEYWORD_WORDS: readonly string[] = (
  "audit audits available code community contract contracts developers ecosystem eth ethereum existing independent independently mainnet open project projects protocol protocols public research review security smart source support team teams tool tools user users verification verified work"
).split(" ");
const GENERIC = new Set(GENERIC_KEYWORD_WORDS);

/** Template and funding wording shared by many proposals. Never a keyword. Edit here. */
export const BOILERPLATE_PHRASES: readonly string[] = [
  "adoption work",
  "below follow",
  "complete freedom",
  "ethereum foundation",
  "final milestones",
  "funded work",
  "grant funds",
  "grant pays",
  "hard requirements",
  "milestone reviewer",
  "milestones below",
  "possible approach",
  "requirements below",
  "rfp pays",
  "selected team",
  "starting point",
  "thedao security",
  "security fund",
];
const BOILERPLATE = new Set(BOILERPLATE_PHRASES);

export interface Technology {
  name: string;
  /** Case-sensitive pattern; names never match inside a longer word. */
  pattern: RegExp;
  /** When set, a match at the very start of a sentence counts only if the sentence starts with this. */
  sentenceStart?: RegExp;
}

const word = (s: string) => new RegExp(`(?<![A-Za-z0-9_-])(?:${s})(?![A-Za-z0-9_-])`);
/**
 * Named technologies. Matching is case-sensitive with word boundaries, so "safe" (the adjective),
 * "Safe Harbor" (the whitehat agreement) and "ZKsync" do not match "Safe" or "ZK". "Safe" at the
 * start of a sentence counts only when the next word names the product ("Safe owners", "Safe{Wallet}").
 * Edit here; METHODOLOGY.md lists the names.
 */
export const TECHNOLOGIES: readonly Technology[] = [
  { name: "Aderyn", pattern: word("Aderyn") },
  { name: "Besu", pattern: word("Besu") },
  { name: "Blockscout", pattern: word("Blockscout") },
  { name: "Certora", pattern: word("Certora") },
  { name: "Clear Signing", pattern: /(?<![A-Za-z0-9_-])[Cc]lear[ -][Ss]igning(?![A-Za-z0-9_-])/ },
  { name: "Echidna", pattern: word("Echidna") },
  { name: "Erigon", pattern: word("Erigon") },
  { name: "Foundry", pattern: word("Foundry") },
  { name: "Geth", pattern: word("Geth") },
  { name: "Gigahorse", pattern: word("Gigahorse") },
  { name: "Halmos", pattern: word("Halmos") },
  { name: "Hardhat", pattern: word("Hardhat") },
  { name: "hevm", pattern: word("hevm") },
  { name: "Kontrol", pattern: word("Kontrol") },
  { name: "Lean 4", pattern: word("Lean 4") },
  { name: "Ledger", pattern: word("Ledger") },
  { name: "libp2p", pattern: word("libp2p") },
  { name: "Lighthouse", pattern: word("Lighthouse") },
  { name: "Lodestar", pattern: word("Lodestar") },
  { name: "Medusa", pattern: word("Medusa") },
  { name: "MetaMask", pattern: word("MetaMask") },
  { name: "Mythril", pattern: word("Mythril") },
  { name: "Nimbus", pattern: word("Nimbus") },
  { name: "Prysm", pattern: word("Prysm") },
  { name: "Rabby", pattern: word("Rabby") },
  { name: "Remix", pattern: word("Remix") },
  { name: "Reth", pattern: word("Reth") },
  {
    name: "Safe",
    pattern: /(?<![A-Za-z0-9_-])Safes?(?![A-Za-z0-9_-])(?! Harbor)/,
    sentenceStart: /^Safes?(?:\{Wallet\}| Wallet| Labs| multisig| account| accounts| module| owners| signers| transaction| transactions| contract| contracts| UI| app)/,
  },
  { name: "Semgrep", pattern: word("Semgrep") },
  { name: "Slither", pattern: word("Slither") },
  { name: "Sourcify", pattern: word("Sourcify") },
  { name: "TEE", pattern: word("TEEs?") },
  { name: "Teku", pattern: word("Teku") },
  { name: "Trezor", pattern: word("Trezor") },
  { name: "Vyper", pattern: word("Vyper") },
  { name: "Wake", pattern: word("Wake") },
  { name: "ZK", pattern: /(?<![A-Za-z0-9_-])(?:ZK|zkVMs?|[Zz]ero-knowledge)(?![A-Za-z0-9_-])/ },
];

const TECH_PHRASES = new Set(TECHNOLOGIES.map((t) => t.name.toLowerCase()).filter((n) => n.includes(" ")));

const STANDARD_RE = /(?<![A-Za-z0-9_-])(ERC|EIP|RIP)[-\s]?(\d{2,5})(?![A-Za-z0-9_])/g;

export interface SimilarQuote {
  initiativeId: string;
  /** Official section key and heading. */
  section: string;
  heading: string;
  /** One sentence of the section, verbatim with Markdown formatting removed. */
  text: string;
  /** Official initiative page, anchored at the section. */
  url: string;
  /** The shared terms this sentence contains. */
  terms: string[];
}

export interface SimilarSignal {
  kind: SimilarSignalKind;
  strength: SignalStrength;
  /** Plain description, for example "Both name Echidna, Foundry". */
  label: string;
  /** The shared items (categories, groups, phrases, names or backers), alphabetical. */
  terms: string[];
  /** One sentence from each proposal (a, then b) for keyword and technology signals; null otherwise. */
  quotes: [SimilarQuote, SimilarQuote] | null;
}

export interface SimilarPair {
  /** The pair is ordered by title, then id: a sorts first. */
  a: string;
  b: string;
  label: SimilarLabel;
  signals: SimilarSignal[];
  notice: typeof HYPOTHESIS_NOTICE;
}

export interface SimilarInput {
  initiatives: readonly Initiative[];
  pledges: readonly Pledge[];
  organizations: readonly Organization[];
  /** Initiative id → affiliation groups from the vote manifest, or null when the manifest is not aligned. */
  groups: Readonly<Record<string, readonly string[]>> | null;
}

interface Sentence {
  section: string;
  heading: string;
  text: string;
  phrases: Set<string>;
  tech: Set<string>;
  /** Standard key → forms as written ("ERC-7730"). */
  standards: Map<string, Set<string>>;
}

/** Two-word keyword phrases in one sentence. Phrases never cross punctuation. */
export function keywordPhrases(sentence: string): string[] {
  const out = new Set<string>();
  for (const chunk of sentence.replace(/https?:\/\/\S+/g, " ").split(/[,;:()[\]{}"“”‘’!?…|]+|\.(?:\s|$)|\s[-–]\s/)) {
    const w = chunk
      .toLowerCase()
      .split(/[^a-z0-9'-]+/)
      .map((x) => x.replace(/'s$/, "").replace(/^[-']+|[-']+$/g, ""))
      .filter(Boolean);
    for (let i = 0; i + 1 < w.length; i++) {
      const p = w[i] as string;
      const q = w[i + 1] as string;
      if (p.length < 3 || q.length < 3 || STOP.has(p) || STOP.has(q) || /^\d/.test(p) || /^\d/.test(q) || /'/.test(p) || /'/.test(q)) continue;
      if (GENERIC.has(p) && GENERIC.has(q)) continue;
      const phrase = `${p} ${q}`;
      // A technology name ("clear signing") is reported once, under technologies.
      if (!BOILERPLATE.has(phrase) && !TECH_PHRASES.has(phrase)) out.add(phrase);
    }
  }
  return [...out];
}

/** Technology names in one sentence (TECHNOLOGIES rules). */
export function technologiesIn(sentence: string): string[] {
  const out: string[] = [];
  for (const t of TECHNOLOGIES) {
    const re = new RegExp(t.pattern.source, `${t.pattern.flags.replace("g", "")}g`);
    for (const m of sentence.matchAll(re)) {
      if (m.index === 0 && t.sentenceStart && !t.sentenceStart.test(sentence)) continue;
      out.push(t.name);
      break;
    }
  }
  return out;
}

function standardsIn(sentence: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const m of sentence.matchAll(STANDARD_RE)) {
    const prefix = m[1] as string;
    const key = `${prefix === "RIP" ? "RIP" : "EIP"}-${m[2]}`;
    out.set(key, new Set([...(out.get(key) ?? []), `${prefix}-${m[2]}`]));
  }
  return out;
}

function sentencesOf(ini: Initiative): Sentence[] {
  const out: Sentence[] = [];
  for (const key of SIMILAR_SECTIONS) {
    const s = ini.sections.find((x) => x.key === key);
    if (!s) continue;
    for (const text of sentences(s.markdown)) out.push({ section: s.key, heading: s.heading, text, phrases: new Set(keywordPhrases(text)), tech: new Set(technologiesIn(text)), standards: standardsIn(text) });
  }
  return out;
}

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const sorted = (xs: Iterable<string>) => [...new Set(xs)].sort(byText);

/** The sentence with the most of the given terms; ties go to the earliest sentence. */
function bestQuote(ini: Initiative, list: Sentence[], has: (s: Sentence, term: string) => boolean, terms: string[]): SimilarQuote | null {
  let best: { s: Sentence; hit: string[] } | null = null;
  for (const s of list) {
    const hit = terms.filter((t) => has(s, t));
    if (hit.length && (!best || hit.length > best.hit.length)) best = { s, hit };
  }
  return best ? { initiativeId: ini.id, section: best.s.section, heading: best.s.heading, text: best.s.text, url: `${ini.url}#${best.s.section}`, terms: best.hit } : null;
}

const titleOrder = (x: Initiative, y: Initiative) => x.title.localeCompare(y.title, "en") || byText(x.id, y.id);

/** All visible pairs, ordered by the first title, then the second. */
export function similarPairs(input: SimilarInput): SimilarPair[] {
  const inis = [...input.initiatives].sort(titleOrder);
  const sents = new Map(inis.map((i) => [i.id, sentencesOf(i)]));
  const phraseSets = new Map(inis.map((i) => [i.id, new Set((sents.get(i.id) ?? []).flatMap((s) => [...s.phrases]))]));
  const df = new Map<string, number>();
  for (const set of phraseSets.values()) for (const p of set) df.set(p, (df.get(p) ?? 0) + 1);
  const techSets = new Map(inis.map((i) => [i.id, new Set((sents.get(i.id) ?? []).flatMap((s) => [...s.tech]))]));
  const stdForms = new Map<string, Map<string, Set<string>>>();
  for (const i of inis) {
    const m = new Map<string, Set<string>>();
    for (const s of sents.get(i.id) ?? []) for (const [k, forms] of s.standards) m.set(k, new Set([...(m.get(k) ?? []), ...forms]));
    stdForms.set(i.id, m);
  }
  const anonymous = new Set(input.organizations.filter((o) => o.anonymous).map((o) => o.id));
  const orgName = new Map(input.organizations.map((o) => [o.id, o.name]));
  const backers = new Map<string, Map<string, string>>();
  for (const p of input.pledges) {
    if (!p.backerId || anonymous.has(p.backerId) || /anon/i.test(p.backerId)) continue;
    const m = backers.get(p.initiativeId) ?? new Map<string, string>();
    if (!m.has(p.backerId)) m.set(p.backerId, orgName.get(p.backerId) ?? p.company);
    backers.set(p.initiativeId, m);
  }

  const out: SimilarPair[] = [];
  for (let x = 0; x < inis.length; x++) {
    for (let y = x + 1; y < inis.length; y++) {
      const a = inis[x] as Initiative;
      const b = inis[y] as Initiative;
      const sa = sents.get(a.id) ?? [];
      const sb = sents.get(b.id) ?? [];
      const signals: SimilarSignal[] = [];

      const cats = sorted(a.categories.filter((c) => b.categories.some((d) => d.slug === c.slug)).map((c) => c.label));
      if (cats.length) signals.push({ kind: "category", strength: "weak", label: `Same official ${cats.length === 1 ? "category" : "categories"}: ${cats.join(", ")}`, terms: cats, quotes: null });

      const ga = input.groups?.[a.id] ?? [];
      const groups = sorted((input.groups?.[b.id] ?? []).filter((g) => ga.includes(g)));
      if (groups.length) signals.push({ kind: "affiliation_group", strength: "strong", label: `Same affiliation group in TheDAO's vote manifest: ${groups.join(", ")}`, terms: groups, quotes: null });

      const pa = phraseSets.get(a.id) as Set<string>;
      const phrases = sorted([...(phraseSets.get(b.id) as Set<string>)].filter((p) => pa.has(p) && (df.get(p) ?? 0) <= SIMILAR_THRESHOLDS.keywordMaxInitiatives));
      if (phrases.length) {
        const has = (s: Sentence, t: string) => s.phrases.has(t);
        const qa = bestQuote(a, sa, has, phrases);
        const qb = bestQuote(b, sb, has, phrases);
        if (qa && qb)
          signals.push({
            kind: "keywords",
            strength: phrases.length >= SIMILAR_THRESHOLDS.keywordStrongMin ? "strong" : "weak",
            label: `Shared ${phrases.length === 1 ? "phrase" : "phrases"} in the problem and scope sections: ${phrases.join(", ")}`,
            terms: phrases,
            quotes: [qa, qb],
          });
      }

      const ta = techSets.get(a.id) as Set<string>;
      const techs = [...(techSets.get(b.id) as Set<string>)].filter((t) => ta.has(t));
      const fa = stdForms.get(a.id) as Map<string, Set<string>>;
      const fb = stdForms.get(b.id) as Map<string, Set<string>>;
      const stdKeys = [...fb.keys()].filter((k) => fa.has(k));
      const stdLabel = new Map(stdKeys.map((k) => [k, sorted([...(fa.get(k) ?? []), ...(fb.get(k) ?? [])]).join(" / ")]));
      const named = sorted([...techs, ...stdLabel.values()]);
      if (named.length) {
        const keyOf = new Map<string, { tech?: string; std?: string }>();
        for (const t of techs) keyOf.set(t, { tech: t });
        for (const [k, l] of stdLabel) keyOf.set(l, { std: k });
        const has = (s: Sentence, t: string) => {
          const k = keyOf.get(t);
          return !!k && ((!!k.tech && s.tech.has(k.tech)) || (!!k.std && s.standards.has(k.std)));
        };
        const qa = bestQuote(a, sa, has, named);
        const qb = bestQuote(b, sb, has, named);
        if (qa && qb) signals.push({ kind: "technology", strength: "strong", label: `Both name ${named.join(", ")}`, terms: named, quotes: [qa, qb] });
      }

      const ba = backers.get(a.id) ?? new Map<string, string>();
      const shared = sorted([...(backers.get(b.id) ?? new Map<string, string>())].filter(([k]) => ba.has(k)).map(([, n]) => n));
      if (shared.length) signals.push({ kind: "backer", strength: "strong", label: `Shared public ${shared.length === 1 ? "backer" : "backers"}: ${shared.join(", ")}`, terms: shared, quotes: null });

      if (!isVisible(signals)) continue;
      const label: SimilarLabel = a.organizationId && a.organizationId === b.organizationId ? "Same organization" : cats.length ? "Possible overlap" : "Possible complement";
      out.push({ a: a.id, b: b.id, label, signals, notice: HYPOTHESIS_NOTICE });
    }
  }
  return out;
}

/** A pair is shown when it has a text signal with quotes and is more than one weak signal. */
export function isVisible(signals: readonly SimilarSignal[]): boolean {
  const text = signals.some((s) => (s.kind === "keywords" || s.kind === "technology") && !!s.quotes);
  if (!text) return false;
  return signals.length >= 2 || signals.some((s) => s.strength === "strong");
}
