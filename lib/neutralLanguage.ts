/**
 * Shared neutral-language standard (see NEUTRAL_LANGUAGE.md). One list of banned phrases and one
 * list of allowed framing, used by the source lint (tests/unit/neutral-language-lint.test.ts), the
 * skills build and every place that shows or exports generated text. Browser-safe: no Node imports.
 */

/** Bump when the lists or the matching rules change. Mirrors the version in NEUTRAL_LANGUAGE.md. */
export const NEUTRAL_LANGUAGE_VERSION = "2026.11-v1";

/** Banned phrases, verbatim from NEUTRAL_LANGUAGE.md. Matching is case-insensitive. */
export const BANNED_PHRASES = [
  "vote for",
  "vote against",
  "you should",
  "should fund",
  "should not",
  "recommended",
  "recommend",
  "best",
  "worst",
  "top pick",
  "must fund",
  "must-fund",
  "avoid",
  "skip",
  "winner",
  "safe bet",
  "underrated",
  "overrated",
  "deserves",
] as const;
export type BannedPhrase = (typeof BANNED_PHRASES)[number];

/** Allowed framing, verbatim from NEUTRAL_LANGUAGE.md. "X" stands for the selected focus. */
export const ALLOWED_FRAMING = [
  "This may interest you because…",
  "Matches your selected focus: X",
  "Evidence found",
  "Not yet verified",
  "Question to consider",
  "Possible overlap",
] as const;

/** The four source labels (Item 14). Every statement shown is attributed to exactly one. */
export const SOURCE_LABELS = {
  official: "Official data",
  applicant: "Applicant statement",
  independent: "Independent evidence",
  ai: "AI interpretation",
} as const;
export type SourceKind = keyof typeof SOURCE_LABELS;

/** Wording for missing information. Never phrase absence as a negative finding. */
export const NOT_FOUND = "Not found";

/**
 * Phrase separators: whitespace, ASCII and Unicode hyphens, underscore, or nothing. So
 * "must fund", "must-fund", "must‑fund" (non-breaking hyphen) and "mustfund" all match.
 */
const SEP = "[\\s\\-\\u2010\\u2011\\u2012\\u2013_]*";
/** Letters or digits on either side mean the hit is part of a longer word ("bestow", "skipper"). */
const L = "(?<![\\p{L}\\p{N}])";
const R = "(?![\\p{L}\\p{N}])";

/**
 * One pattern per banned phrase. Each covers the listed form plus its inflections, so the stem in
 * the list also catches "recommendation", "skipped", "avoiding", "winners", "deserve" and
 * "should be funded". A word that merely starts with the same letters ("bestow", "skipper",
 * "voter for") does not match.
 */
const PATTERNS: Record<BannedPhrase, string> = {
  "vote for": `vot(?:e|es|ed|ing)${SEP}for`,
  "vote against": `vot(?:e|es|ed|ing)${SEP}against`,
  "you should": `you${SEP}should(?:n['’]?t)?`,
  "should fund": `should${SEP}(?:be${SEP})?fund(?:s|ed|ing)?`,
  "should not": `(?:should${SEP}not|shouldn['’]?t)`,
  recommended: `recommended`,
  recommend: `recommend(?:s|ing|ation|ations|able)?`,
  best: `best`,
  worst: `worst`,
  "top pick": `top${SEP}picks?`,
  "must fund": `must${SEP}(?:be${SEP})?fund(?:s|ed|ing)?`,
  "must-fund": `must-fund(?:s|ed|ing)?`,
  avoid: `avoid(?:s|ed|ing|ance|able)?`,
  skip: `skip(?:s|ped|ping|pable)?`,
  winner: `winners?`,
  "safe bet": `safe${SEP}bets?`,
  underrated: `under${SEP}rat(?:ed|es|e|ing)`,
  overrated: `over${SEP}rat(?:ed|es|e|ing)`,
  deserves: `deserv(?:e|es|ed|ing)`,
};

const COMPILED: { phrase: BannedPhrase; re: RegExp }[] = BANNED_PHRASES.map((phrase) => ({ phrase, re: new RegExp(`${L}${PATTERNS[phrase]}${R}`, "giu") }));

export interface BannedMatch {
  /** The banned list entry that matched. */
  phrase: BannedPhrase;
  /** The text as it appears in the input. */
  match: string;
  /** Offset of the match in the input. */
  index: number;
}

/**
 * Explicit official-quotation marker for text and Markdown:
 * `<official-quote source="https://...">verbatim TheDAO text</official-quote>`.
 * Text inside the marker is a quotation of an official source, not our voice, and is exempt.
 * In React, use the OfficialQuote component (components/ui/official-quote.tsx), which renders the
 * same marker as a data attribute.
 */
export const OFFICIAL_QUOTE_OPEN = "<official-quote";
export const OFFICIAL_QUOTE_CLOSE = "</official-quote>";
export const OFFICIAL_QUOTE_ATTR = "data-official-quote";
const QUOTE_RE = /<official-quote(?:\s[^>]*)?>[\s\S]*?<\/official-quote>/giu;

/** Wraps verbatim official text in the quotation marker. */
export function officialQuote(text: string, source: string): string {
  const src = source.replace(/"/g, "&quot;");
  return `${OFFICIAL_QUOTE_OPEN} source="${src}">${text}${OFFICIAL_QUOTE_CLOSE}`;
}

/**
 * Blanks out every marked official quotation. Characters are replaced by spaces, not removed, so
 * offsets reported by findBannedPhrases on the result still point into the original text.
 */
export function stripOfficialQuotations(text: string): string {
  return text.replace(QUOTE_RE, (m) => m.replace(/[^\n]/g, " "));
}

/** All banned phrases in `text` (outside marked official quotations), in order of position. */
export function findBannedPhrases(text: string): BannedMatch[] {
  const scan = stripOfficialQuotations(text);
  const out: BannedMatch[] = [];
  const seen = new Set<string>();
  for (const { phrase, re } of COMPILED) {
    re.lastIndex = 0;
    for (const m of scan.matchAll(re)) {
      // "must-fund" is listed separately from "must fund"; report each span once.
      const key = `${m.index}:${m[0].length}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ phrase, match: m[0], index: m.index });
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

export const isNeutral = (text: string) => findBannedPhrases(text).length === 0;

export type FilterResult = { ok: true; text: string } | { ok: false; fallback: string; matches: BannedMatch[] };

/**
 * Runs before any generated (AI-style) text is displayed or exported. If the text contains a
 * banned phrase, the generated text is discarded and the raw evidence is returned instead.
 */
export function filterAiOutput(text: string, rawEvidenceFallback: string): FilterResult {
  const matches = findBannedPhrases(text);
  if (matches.length === 0) return { ok: true, text };
  return { ok: false, fallback: rawEvidenceFallback, matches };
}

/** Short explanation shown when generated text was discarded by the filter. */
export const FILTERED_NOTICE =
  "Generated text was withheld because it did not follow the neutral-language rules. The raw evidence is shown instead.";
