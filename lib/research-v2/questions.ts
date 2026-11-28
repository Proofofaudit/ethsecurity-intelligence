/**
 * Item 20: one merged, deduplicated "Questions to check" list per initiative. Pure and
 * deterministic: no network, no model, no score. It combines
 *   - the eight rules of lib/intelligence/open-questions.ts,
 *   - the rule-based blind spots of blindSpots() in lib/intelligence/service.ts, and
 *   - new rules over the team research artifact and the stored research results.
 * Every candidate gets a topic key. Candidates with the same topic are one question; their origins
 * and source links are united. Output is ordered by a fixed category order, then alphabetically by
 * text, never by any score. A question is a prompt to investigate, never a finding.
 * The old engines are unchanged and keep working.
 */
import type { Dataset, Initiative } from "@/lib/domain/schemas";
import { findBannedPhrases } from "@/lib/neutralLanguage";
import { hypotheses, pairSignals } from "@/lib/intelligence/overlap";
import { possibleSelfPledge } from "@/lib/intelligence/self-pledge";
import { blindSpotSources, blindSpots, openQuestionsFor, type BlindSpot } from "@/lib/intelligence/service";
import { asQuestion } from "@/lib/intelligence/questions-to-check";
import { stableId } from "@/lib/util/hash";

export const MERGED_QUESTIONS_VERSION = "merged-questions@1";
export const QUESTION_COUNT_NOTE = "Counts are not a quality score. A question is not an accusation and not a finding that something is wrong.";

/** Fixed display order of the categories. */
export const MERGED_CATEGORIES = ["Timeline", "Delivery", "Funding", "Adoption", "Evidence", "Team", "Overlap"] as const;
export type MergedCategory = (typeof MERGED_CATEGORIES)[number];
export type MergedOrigin = "open-question" | "blind-spot" | "team-research";

/** A repository with no push for this many days counts as inactive (6 months). */
export const INACTIVE_REPO_DAYS = 183;
/**
 * Goal rule: a question is asked only when the requested goal is more than this multiple of the
 * largest past grant amount on record (dataset.previousGrants with a known amount, and Round 1
 * records matched to the initiative with a fixed USD value). Both amounts must be known.
 */
export const GOAL_VS_PAST_GRANT_MULTIPLE = 3;

export interface MergedQuestion {
  id: string;
  /** Stable dedupe key: the same gap about the same record has the same topic. */
  topic: string;
  /** Always a neutral question ending with a question mark. */
  text: string;
  /** At least one http(s) link. */
  sourceUrls: string[];
  checkedOn: string;
  origins: MergedOrigin[];
  category: MergedCategory;
}

/** The parts of the published team research file the generator reads. */
export interface TeamResearchInput {
  initiatives: {
    initiativeId: string;
    members?: { name: string; handles?: { platform: string; handle: string }[]; githubMonthlyCommits?: number[]; sourceUrl?: string; checkedOn?: string }[];
    organization?: { name: string } | null;
    claimChecks?: { claim: string; status: string; sources: { url: string }[]; checkedOn: string }[];
    passes?: { team?: boolean; delivery?: boolean; claims?: boolean };
    checkedOn?: string;
  }[];
}

interface Candidate {
  topic: string;
  text: string;
  sourceUrls: string[];
  checkedOn: string;
  origin: MergedOrigin;
  category: MergedCategory;
}

const isHttp = (u: unknown): u is string => typeof u === "string" && /^https?:\/\/\S+$/.test(u);
const day = (s: string | null | undefined) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : "");
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Wording must end with a question mark; "…? (note)" becomes "… (note)?". */
function ensureQuestion(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  const moved = /^(.*?)\?\s*(\([^()]*\))$/.exec(t);
  if (moved) return `${moved[1]} ${moved[2]}?`;
  return t.endsWith("?") ? t : `${t.replace(/[.:;!]+$/, "")}?`;
}

/** Text with a banned phrase is replaced by the fallback; the fallback itself is a fixed neutral string. */
const neutral = (text: string, fallback: string) => (findBannedPhrases(text).length === 0 ? text : fallback);

const BLIND_CATEGORY: Record<BlindSpot["category"], MergedCategory> = {
  unsupported_material_claim: "Evidence",
  adoption_dependency: "Adoption",
  unclear_criterion: "Delivery",
  possible_overlap: "Overlap",
  maintenance_statement_absent: "Delivery",
  no_linked_existing_work: "Evidence",
  unconfirmed_integration: "Evidence",
};

/** Topic of a blind spot. The same record or gap as an open-question rule gets the same topic. */
export function blindSpotTopic(b: BlindSpot): string {
  const ref = b.refs[0] ?? "";
  switch (b.category) {
    case "adoption_dependency":
      return `adoption:${ref}`;
    case "unconfirmed_integration":
      return `integration-claim:${ref}`;
    case "unsupported_material_claim":
      return `figure-source:${ref}`;
    case "unclear_criterion":
      return `criterion:${b.id}`;
    case "possible_overlap":
      return `overlap:${[b.initiativeId, b.refs[1] ?? ""].sort().join("+")}`;
    case "maintenance_statement_absent":
      return "maintenance";
    case "no_linked_existing_work":
      return "repository-or-product";
  }
}

/** Topic of an open-question rule. Rules that ask about one record carry the record id. */
export function openQuestionTopic(ruleId: string, ref: string | null): string {
  switch (ruleId) {
    case "milestone_no_target_date":
      return `target-date:${ref}`;
    case "rfp_no_recipient":
      return "recipient";
    case "no_repository_or_product_link":
      return "repository-or-product";
    case "adoption_named_party":
      return `adoption:${ref}`;
    case "possible_self_pledge":
      return `self-pledge:${ref}`;
    case "pledge_not_received":
      return `pledge-pending:${ref}`;
    case "no_milestone_reviewer":
      return "reviewer";
    case "existing_claim_without_link":
      return `integration-claim:${ref}`;
    default:
      return `${ruleId}:${ref ?? ""}`;
  }
}

function team(file: TeamResearchInput | undefined, id: string) {
  return file?.initiatives.find((t) => t.initiativeId === id);
}

function pastGrantCeiling(d: Dataset, ini: Initiative): { cents: number; url: string } | null {
  let best: { cents: number; url: string } | null = null;
  for (const g of d.previousGrants) {
    if (g.initiativeId !== ini.id || g.amountCents === null || g.amountCents <= 0) continue;
    if (!best || g.amountCents > best.cents) best = { cents: g.amountCents, url: g.sourceUrls.find(isHttp) ?? ini.url };
  }
  for (const m of d.round1.initiativeMatches[ini.id] ?? []) {
    if (m.status !== "match" || m.level !== "project") continue;
    const p = d.round1.projects.find((x) => x.id === m.projectId);
    // A record with a live stream changes over time and is never used.
    if (!p || p.liveStream || p.usdWhenSentCents <= 0) continue;
    if (!best || p.usdWhenSentCents > best.cents) best = { cents: p.usdWhenSentCents, url: p.transparencyUrl };
  }
  return best;
}

function candidates(d: Dataset, ini: Initiative, file: TeamResearchInput | undefined, asOf: string, overlapIds: Map<string, string[]>): Candidate[] {
  const out: Candidate[] = [];
  const iniUrl = [ini.url].filter(isHttp);
  const add = (c: Omit<Candidate, "text"> & { text: string; fallback: string }) => {
    const urls = [...new Set(c.sourceUrls.filter(isHttp))];
    out.push({ topic: c.topic, text: ensureQuestion(neutral(c.text, c.fallback)), sourceUrls: urls.length ? urls : iniUrl, checkedOn: c.checkedOn || asOf, origin: c.origin, category: c.category });
  };

  for (const q of openQuestionsFor(d, ini.id) ?? [])
    add({ topic: openQuestionTopic(q.ruleId, q.ref), text: q.question, fallback: `${q.ruleLabel}: can this be clarified?`, sourceUrls: [q.sourceUrl], checkedOn: asOf, origin: "open-question", category: q.category });

  const spots = blindSpots(d).filter((b) => b.initiativeId === ini.id);
  for (const b of spots) {
    const topic = blindSpotTopic(b);
    // Overlap questions are shared with the other initiative; both sides ask the same question once.
    add({ topic, text: asQuestion(b.question).question, fallback: "Can the relevant record be clarified?", sourceUrls: blindSpotSources(d, b).map((s) => s.url), checkedOn: asOf, origin: "blind-spot", category: BLIND_CATEGORY[b.category] });
  }

  const t = team(file, ini.id);

  // Team with a published handle but no public code history found.
  if (t?.passes?.team) {
    const withHandle = (t.members ?? []).filter((m) => (m.handles ?? []).length > 0);
    const commits = withHandle.reduce((n, m) => n + (m.githubMonthlyCommits ?? []).reduce((s, x) => s + x, 0), 0);
    const hasRepo = d.repositories.some((r) => r.initiativeIds.includes(ini.id) && r.exists);
    if (withHandle.length > 0 && commits === 0 && !hasRepo)
      add({
        topic: "team:no-code-history",
        text: "Is there a public code history for the handles the team has published?",
        fallback: "Is there a public code history for the team?",
        sourceUrls: withHandle.map((m) => m.sourceUrl ?? ""),
        checkedOn: day(withHandle[0]?.checkedOn) || day(t.checkedOn),
        origin: "team-research",
        category: "Team",
      });
  }

  // Goal far above the largest past grant on record (both amounts known).
  const past = pastGrantCeiling(d, ini);
  if (past && ini.funding.goalCents > GOAL_VS_PAST_GRANT_MULTIPLE * past.cents)
    add({
      topic: "goal-vs-past-grants",
      text: `The requested goal is more than ${GOAL_VS_PAST_GRANT_MULTIPLE} times the largest past grant on record. How will the team deliver at that scale?`,
      fallback: "How does the requested goal relate to the past grants on record?",
      sourceUrls: [past.url, ...iniUrl],
      checkedOn: asOf,
      origin: "team-research",
      category: "Funding",
    });

  // Overlap with an already-funded project (overlap.ts hypotheses).
  for (const otherId of overlapIds.get(ini.id) ?? []) {
    const other = d.initiatives.find((i) => i.id === otherId);
    if (!other) continue;
    add({
      topic: `overlap:${[ini.id, other.id].sort().join("+")}`,
      text: `Which deliverables of ${ini.shortTitle} and ${other.shortTitle} would substitute for each other, and which are complementary?`,
      fallback: "Which deliverables of the two initiatives would substitute for each other, and which are complementary?",
      sourceUrls: [ini.url, other.url],
      checkedOn: asOf,
      origin: "team-research",
      category: "Overlap",
    });
  }

  // Repository without a push for more than six months.
  for (const r of d.repositories.filter((x) => x.initiativeIds.includes(ini.id) && x.exists && !x.archived && x.pushedAt)) {
    const days = (Date.parse(asOf) - Date.parse(r.pushedAt as string)) / 86_400_000;
    if (Number.isFinite(days) && days > INACTIVE_REPO_DAYS)
      add({
        topic: `repo-inactive:${r.fullName.toLowerCase()}`,
        text: `Is ${r.fullName} still maintained, given that its last public push was more than 6 months ago?`,
        fallback: "Is this repository still maintained, given that its last public push was more than 6 months ago?",
        sourceUrls: [r.url],
        checkedOn: day(r.checkedAt) || asOf,
        origin: "team-research",
        category: "Delivery",
      });
  }

  // Possible self-pledge against the organization named in the team research (self-pledge.ts).
  if (t?.organization?.name) {
    for (const p of d.pledges.filter((x) => x.initiativeId === ini.id)) {
      const sp = possibleSelfPledge(p.company, { recipientTeam: null, organization: { name: t.organization.name, names: [t.organization.name] } });
      if (sp.flagged)
        add({
          topic: `self-pledge:${p.id}`,
          text: `Can the team confirm whether the pledge from ${p.company} is a self-pledge? (possible self-pledge, unverified)`,
          fallback: "Can the team confirm whether this pledge is a self-pledge? (possible self-pledge, unverified)",
          sourceUrls: [p.provenance.sourceUrls[0] ?? ini.url],
          checkedOn: asOf,
          origin: "team-research",
          category: "Funding",
        });
    }
  }

  // Claim checks that a cited source contradicts.
  for (const c of t?.claimChecks ?? []) {
    if (c.status !== "Contradicted by source") continue;
    const claim = c.claim.length > 160 ? `${c.claim.slice(0, 157).trimEnd()}...` : c.claim;
    add({
      topic: `claim-contradicted:${norm(c.claim)}`,
      text: `A cited source differs from the statement "${claim}". Which account matches the public record?`,
      fallback: "A cited source differs from one of the team's statements. Which account matches the public record?",
      sourceUrls: c.sources.map((s) => s.url),
      checkedOn: day(c.checkedOn),
      origin: "team-research",
      category: "Evidence",
    });
  }
  return out;
}

const catIndex = (c: MergedCategory) => MERGED_CATEGORIES.indexOf(c);

interface Detailed {
  questions: MergedQuestion[];
  /** Candidates before the merge. */
  before: number;
}

function overlapTargets(d: Dataset): Map<string, string[]> {
  const byId = new Map(d.initiatives.map((i) => [i.id, i]));
  const funded = (id: string) => {
    const i = byId.get(id);
    if (!i) return false;
    return i.funding.paidOutCents > 0 || (d.round1.initiativeMatches[id] ?? []).some((m) => m.status === "match" && m.level === "project");
  };
  const out = new Map<string, string[]>();
  for (const h of hypotheses(pairSignals(d.initiatives, d.milestones, d.pledges), byId)) {
    if (h.kind !== "potentially_overlaps") continue;
    // The initiative that asks is the one that is not yet funded; the other one is the funded project.
    for (const [a, b] of [[h.a, h.b], [h.b, h.a]] as const) if (funded(b)) out.set(a, [...(out.get(a) ?? []), b]);
  }
  for (const [k, v] of out) out.set(k, [...new Set(v)].sort());
  return out;
}

function detailed(d: Dataset, file?: TeamResearchInput): Map<string, Detailed> {
  const asOf = day(d.meta.generatedAt) || "1970-01-01";
  const overlapIds = overlapTargets(d);
  const out = new Map<string, Detailed>();
  for (const ini of d.initiatives) {
    const cands = candidates(d, ini, file, asOf, overlapIds);
    const merged = new Map<string, MergedQuestion>();
    for (const c of cands) {
      const have = merged.get(c.topic);
      if (!have) {
        merged.set(c.topic, { id: stableId("mq", ini.id, c.topic), topic: c.topic, text: c.text, sourceUrls: [...c.sourceUrls], checkedOn: c.checkedOn, origins: [c.origin], category: c.category });
        continue;
      }
      for (const u of c.sourceUrls) if (!have.sourceUrls.includes(u)) have.sourceUrls.push(u);
      if (!have.origins.includes(c.origin)) have.origins.push(c.origin);
      if (c.checkedOn > have.checkedOn) have.checkedOn = c.checkedOn;
    }
    const questions = [...merged.values()]
      .map((q) => ({ ...q, origins: [...q.origins].sort() as MergedOrigin[] }))
      .sort((a, b) => catIndex(a.category) - catIndex(b.category) || a.text.localeCompare(b.text, "en") || (a.topic < b.topic ? -1 : 1));
    out.set(ini.id, { questions, before: cands.length });
  }
  return out;
}

/** Merged questions for every initiative of the dataset (one entry per initiative, possibly empty). */
export function mergedQuestions(d: Dataset, teamResearch?: TeamResearchInput): Record<string, MergedQuestion[]> {
  return Object.fromEntries([...detailed(d, teamResearch)].map(([id, v]) => [id, v.questions]));
}

export interface QuestionCounts {
  perInitiative: { initiativeId: string; slug: string; before: number; after: number; merged: number }[];
  cohort: { initiatives: number; before: number; after: number; duplicatesMerged: number; byCategory: Record<MergedCategory, number> };
}

/** Per-initiative and cohort totals before and after the merge. Counts are not a quality score. */
export function questionCounts(d: Dataset, teamResearch?: TeamResearchInput): QuestionCounts {
  const det = detailed(d, teamResearch);
  const byCategory = Object.fromEntries(MERGED_CATEGORIES.map((c) => [c, 0])) as Record<MergedCategory, number>;
  const perInitiative = d.initiatives.map((ini) => {
    const x = det.get(ini.id) as Detailed;
    for (const q of x.questions) byCategory[q.category]++;
    return { initiativeId: ini.id, slug: ini.slug, before: x.before, after: x.questions.length, merged: x.before - x.questions.length };
  });
  const before = perInitiative.reduce((n, r) => n + r.before, 0);
  const after = perInitiative.reduce((n, r) => n + r.after, 0);
  return { perInitiative, cohort: { initiatives: perInitiative.length, before, after, duplicatesMerged: before - after, byCategory } };
}

/** Question text with its first source link, the form stored in TeamResearch.questions. */
export const questionLine = (q: Pick<MergedQuestion, "text" | "sourceUrls">) => `${q.text} Source: ${q.sourceUrls[0]}`;
