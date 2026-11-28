/**
 * "Questions to check": the rule-based open questions and the research blind spots merged into
 * one list. The same question is never listed twice for an initiative. Every item is phrased as a
 * question. The number of questions is not a measure of quality: an initiative with more
 * milestones or pledges simply has more records the rules can ask about.
 */
import type { Dataset } from "@/lib/domain/schemas";
import { BLIND_SPOT_LABEL, blindSpots, displayName, openQuestionsFor, type BlindSpot } from "./service";

export const QUESTIONS_NOTE = "Counts are not a quality score. A question is a prompt to investigate, not a finding that something is wrong.";

export interface CheckQuestion {
  id: string;
  initiativeId: string;
  slug: string;
  initiative: string;
  /** The question, ending in a question mark. */
  question: string;
  /** Context that makes the question specific, or null. */
  context: string | null;
  kind: string;
  origin: "rule" | "blind_spot";
  /** Link target inside the dossier. */
  anchor: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Splits a blind-spot text into a leading statement and its final question. */
export function asQuestion(text: string): { question: string; context: string | null } {
  let t = text.trim();
  // A note after the question mark ("... (possible self-pledge, unverified)") is context.
  const last = t.lastIndexOf("?");
  let tail = "";
  if (last >= 0 && last < t.length - 1) {
    tail = t.slice(last + 1).trim();
    t = t.slice(0, last + 1);
  }
  if (!t.endsWith("?")) return { question: `${t.replace(/[.:]+$/, "")}?`, context: tail || null };
  const parts = t.split(/(?<=[.)])\s+(?=[“"A-Z])/);
  const q = parts[parts.length - 1] ?? t;
  const lead = parts.length > 1 ? parts.slice(0, -1).join(" ") : null;
  return { question: q, context: [lead, tail].filter(Boolean).join(" ") || null };
}

function fromBlindSpot(d: Dataset, b: BlindSpot, ini: Dataset["initiatives"][number]): CheckQuestion {
  const { question, context } = asQuestion(b.question);
  return {
    id: b.id,
    initiativeId: ini.id,
    slug: ini.slug,
    initiative: displayName(d, ini),
    question,
    context: context ?? null,
    kind: BLIND_SPOT_LABEL[b.category],
    origin: "blind_spot",
    anchor: "questions",
  };
}

/** Both sources, one list, alphabetical by initiative then in rule order. */
export function questionsToCheck(d: Dataset): CheckQuestion[] {
  const out: CheckQuestion[] = [];
  const seen = new Set<string>();
  // Records the open-question rules already ask about (a milestone or a claim). A blind spot about the same record is the same question.
  const covered = new Set<string>();
  const inis = [...d.initiatives].sort((a, b) => a.title.localeCompare(b.title, "en") || (a.id < b.id ? -1 : 1));
  const blind = blindSpots(d);
  for (const ini of inis) {
    const name = displayName(d, ini);
    for (const q of openQuestionsFor(d, ini.id) ?? []) {
      if (q.ref && (q.ruleId === "adoption_named_party" || q.ruleId === "existing_claim_without_link")) covered.add(q.ref);
      const { question, context } = asQuestion(q.question);
      const key = `${ini.id}|${norm(question)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ id: q.id, initiativeId: ini.id, slug: ini.slug, initiative: name, question, context: context ?? (q.quotes[0] ? `“${q.quotes[0]}”` : null), kind: q.category, origin: "rule", anchor: "questions" });
    }
    for (const b of blind.filter((x) => x.initiativeId === ini.id)) {
      if ((b.category === "adoption_dependency" || b.category === "unconfirmed_integration") && b.refs[0] && covered.has(b.refs[0])) continue;
      const item = fromBlindSpot(d, b, ini);
      const key = `${ini.id}|${norm(item.question)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}
