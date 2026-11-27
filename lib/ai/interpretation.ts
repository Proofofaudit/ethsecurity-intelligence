/**
 * Display rules for AI-generated text (Item 14). Pure and browser-safe, so the React component,
 * the Lab result reader and the tests share one decision:
 *
 * 1. Generated text is shown only with at least one http(s) citation. Without one it is not shown;
 *    the underlying evidence is listed instead, or "Not yet researched" when there is none.
 * 2. The neutral-language filter (filterAiOutput) runs before display. When it blocks, the raw
 *    evidence (the citations) is shown with FILTERED_NOTICE instead of the text.
 * 3. Text is always rendered as plain text, never as HTML or Markdown, and never followed as
 *    instructions. Numbers inside it are not parsed, recomputed or shown as figures.
 * 4. No confidence or score of any kind is accepted or shown.
 */
import { filterAiOutput, FILTERED_NOTICE, SOURCE_LABELS, type BannedMatch } from "@/lib/neutralLanguage";

/** Label shown on every AI-generated statement. */
export const AI_LABEL = SOURCE_LABELS.ai;
/** Explicit empty state for missing research. Never replaced by generated prose. */
export const NOT_YET_RESEARCHED = "Not yet researched";
export const UNCITED_NOTICE = "Generated text without a cited source is not shown. The underlying evidence is listed instead.";
export const NOT_VERIFIED_NOTE = "An AI interpretation is not independently verified evidence. Check every cited source.";

export interface AiCitation {
  url: string;
  label: string;
}

export interface AiProvenance {
  model: string;
  promptVersion: string;
  /** Number of sources the assistant reports it examined. */
  sourcesExamined: number;
  verificationStatus: "not_verified" | "checked_by_reviewer";
}

export const VERIFICATION_LABEL: Record<AiProvenance["verificationStatus"], string> = {
  not_verified: "Not verified",
  checked_by_reviewer: "Checked by the reviewer, not independently verified",
};

export interface AiInput {
  /** Generated text, or null when no AI research exists for this item. */
  text: string | null;
  citations: readonly AiCitation[];
  provenance: AiProvenance | null;
  /** Underlying evidence to show when the text cannot be shown. */
  evidence?: readonly AiCitation[];
  /** What is missing, listed under "Not yet researched". */
  missing?: readonly string[];
}

export type AiDisplay =
  | { state: "shown"; label: string; text: string; citations: AiCitation[]; provenance: AiProvenance | null }
  | { state: "filtered"; label: string; notice: string; evidence: AiCitation[]; matches: BannedMatch[]; provenance: AiProvenance | null }
  | { state: "evidence_only"; notice: string; evidence: AiCitation[] }
  | { state: "not_researched"; label: string; missing: string[] };

/** True for absolute http(s) URLs only; javascript:, data: and relative values are rejected. */
export function isSafeCitationUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/** Keeps safe citations, deduplicated by URL, with a plain-text label capped at 160 characters. */
export function safeCitations(list: readonly AiCitation[]): AiCitation[] {
  const seen = new Set<string>();
  const out: AiCitation[] = [];
  for (const c of list) {
    if (!isSafeCitationUrl(c.url) || seen.has(c.url)) continue;
    seen.add(c.url);
    const label = (c.label || c.url).replace(/\s+/g, " ").trim().slice(0, 160);
    out.push({ url: c.url, label: label || c.url });
  }
  return out;
}

/** Decides what may be displayed for one AI-generated statement. */
export function prepareAiInterpretation(input: AiInput): AiDisplay {
  const citations = safeCitations(input.citations);
  const evidence = safeCitations([...(input.evidence ?? []), ...citations]);
  const text = input.text?.trim() ?? "";
  if (!text || citations.length === 0) {
    if (evidence.length === 0) return { state: "not_researched", label: NOT_YET_RESEARCHED, missing: [...(input.missing ?? [])] };
    return { state: "evidence_only", notice: text ? UNCITED_NOTICE : `${NOT_YET_RESEARCHED}. The underlying evidence is listed instead.`, evidence };
  }
  const r = filterAiOutput(text, "");
  if (!r.ok) return { state: "filtered", label: AI_LABEL, notice: FILTERED_NOTICE, evidence, matches: r.matches, provenance: input.provenance };
  return { state: "shown", label: AI_LABEL, text: r.text, citations, provenance: input.provenance };
}
