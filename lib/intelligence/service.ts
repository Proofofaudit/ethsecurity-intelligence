/**
 * Shared intelligence engine. Pure functions over a Dataset; used identically by the web UI,
 * the REST API, the MCP server and exports. No function here invents values: every output is
 * either copied from the dataset or computed deterministically from it.
 */
import { z } from "zod";
import type { Claim, Dataset, EntityType, EvidenceStatus, Initiative, LifecycleStage, Milestone, Relationship, Round1Match } from "@/lib/domain/schemas";
import { EVIDENCE_STATUS_LABEL } from "@/lib/domain/schemas";
import { ONE_TS_DOMAINS, SECURITY_PROBLEMS, STAGE_LABEL, STAGE_ONE_TS } from "@/lib/domain/taxonomy";
import { backerTotals, cohortMetrics, initiativeMetrics, type MetricValue } from "@/lib/metrics/compute";
import { METHODOLOGY_VERSION, METRIC_BY_ID } from "@/lib/metrics/registry";
import { NEUTRAL_SORT_LABEL, SOURCE_LABELS } from "@/lib/neutralLanguage";
import { formatUsd, sumCents } from "@/lib/util/money";
import { sharedAffiliations, type SharedGroup } from "@/lib/vote/affiliation";
import { voteFeatureState } from "@/lib/vote/manifest";
import { sentences } from "@/lib/util/text";
import { hypotheses, pairSignals, type PairSignals } from "./overlap";
import { buildBm25, searchBm25 } from "./similarity";
import { ROUND1_EMPTY_TEXT, ROUND1_POSSIBLE_TEXT } from "./round1";
import { buildEvidenceCard, evidenceCardRow, type EvidenceCard, type EvidenceCardRow } from "./evidence-card";
import { similarPairs, type SimilarLabel, type SimilarPair, type SimilarSignal } from "./similar";
import { buildBriefing, type Briefing } from "./briefing";
import { cohortPartyLexicon, countByCategory, openQuestions, type CategoryCounts, type OpenQuestion } from "./open-questions";

export { EVIDENCE_CARD_SECTIONS, NO_LINKS_TEXT, type EvidenceCard, type EvidenceCardRow, type CardItem, type CardSection } from "./evidence-card";
export { possibleSelfPledge, SELF_PLEDGE_LABEL } from "./self-pledge";
export {
  OPEN_QUESTION_CATEGORIES,
  OPEN_QUESTION_NOTICE,
  OPEN_QUESTION_RULES,
  OPEN_QUESTIONS_VERSION,
  questionsAsText,
  type CategoryCounts,
  type OpenQuestion,
  type OpenQuestionCategory,
} from "./open-questions";
export { HYPOTHESIS_NOTICE, SIMILAR_LABELS, SIMILAR_METHOD_VERSION, type SimilarLabel, type SimilarPair, type SimilarQuote, type SimilarSignal } from "./similar";

export const PRESENT_SUPPORTED: EvidenceStatus[] = ["independently_verified", "partially_supported"];

export const LIMITATIONS = [
  "Research covers only the 55 initiatives frozen as the November 2026 ballot cohort.",
  "Official figures come from TheDAO Security Fund API and may lag the live site by the API's cache interval.",
  "Applicant statements are shown as quotations and are not treated as verified facts.",
  "Repository activity and reachability describe what exists publicly; they are not measures of security quality.",
  "Lifecycle tags and similarity hypotheses are rule-based and must be read as prompts for investigation, not findings.",
  "No ranking, score or voting advice is produced. Decisions remain with the reviewer.",
];

export function envelope<T>(d: Dataset, data: T, extra: { sources?: string[]; limitations?: string[] } = {}) {
  return {
    data,
    meta: {
      datasetVersion: d.meta.datasetVersion,
      officialDataGeneratedAt: d.meta.officialGeneratedAt,
      publishedAt: d.meta.generatedAt,
      methodologyVersion: METHODOLOGY_VERSION,
      methodology: "https://github.com/Proofofaudit/ethsecurity-intelligence/blob/main/METHODOLOGY.md",
      sources: extra.sources ?? [d.meta.officialSourceUrl],
      limitations: [...(extra.limitations ?? []), ...LIMITATIONS.slice(0, 3)],
    },
  };
}

export function findInitiative(d: Dataset, idOrSlug: string): Initiative | undefined {
  return d.initiatives.find((i) => i.id === idOrSlug || i.slug === idOrSlug);
}

/**
 * Label used where several initiatives appear together. Some recipients have more than one
 * initiative with the same short title (for example three "colibri" proposals), so those fall
 * back to the official title.
 */
export function displayName(d: Dataset, ini: Pick<Initiative, "id" | "shortTitle" | "title">): string {
  const dup = d.initiatives.some((x) => x.id !== ini.id && x.shortTitle.toLowerCase() === ini.shortTitle.toLowerCase());
  if (!dup) return ini.shortTitle;
  return ini.title.length > 64 ? `${ini.title.slice(0, 63).trimEnd()}…` : ini.title;
}

export function orgName(d: Dataset, id: string | null): string | null {
  if (!id) return null;
  return d.organizations.find((o) => o.id === id)?.name ?? null;
}

// ───────────────────────────── Summaries & filtering ─────────────────────────────

export interface InitiativeSummary {
  id: string;
  slug: string;
  title: string;
  shortTitle: string;
  type: "grant" | "rfp";
  organization: string | null;
  organizationId: string | null;
  recipientTeam: string | null;
  categories: { slug: string; label: string }[];
  stages: { stage: LifecycleStage; label: string; primary: boolean }[];
  standards: string[];
  goalCents: number;
  raisedCents: number;
  pledgedCents: number;
  donatedCents: number;
  receivedCents: number;
  /** Remaining funding gap (uncapped). Secondary to theDaoAskCents. */
  remainingCents: number;
  /** TheDAO ask: min(200,000 USD, max(0, goal − raised)); null = unavailable. */
  theDaoAskCents: number | null;
  pct: number | null;
  backers: number;
  milestones: number;
  adoptionMilestones: number;
  adoptionShare: number | null;
  completedMilestones: number;
  questions: number;
  publicRepos: number;
  reachableProducts: number;
  hasExistingWork: boolean;
  evidenceCoverage: number | null;
  supportedClaims: number;
  claimCount: number;
  plannedIntegrations: number;
  researchComplete: boolean;
  onBallot: boolean;
  eligibilityNote: string | null;
  durationMonths: number | null;
  url: string;
  /** Manifest affiliation groups shared with other initiatives (empty when groups are unavailable). */
  affiliatedWith: SharedGroup[];
}

const sharedCache = new WeakMap<Dataset, Record<string, SharedGroup[]>>();
/** Cached sharedAffiliations with display names as labels. */
export function sharedGroupsOf(d: Dataset, id: string): SharedGroup[] {
  let m = sharedCache.get(d);
  if (!m) sharedCache.set(d, (m = sharedAffiliations(d, (i) => displayName(d, i))));
  return m[id] ?? [];
}

export function summarize(d: Dataset, ini: Initiative): InitiativeSummary {
  const m = initiativeMetrics(d, ini);
  const ms = d.milestones.filter((x) => x.initiativeId === ini.id);
  const cl = d.claims.filter((c) => c.initiativeId === ini.id);
  const repos = d.repositories.filter((r) => r.initiativeIds.includes(ini.id) && r.exists);
  const products = d.products.filter((p) => p.initiativeIds.includes(ini.id) && p.reachable);
  const tasks = ["websites", "github", "milestone_artifacts", "donations_onchain"];
  return {
    id: ini.id,
    slug: ini.slug,
    title: ini.title,
    shortTitle: ini.shortTitle,
    type: ini.type,
    organization: orgName(d, ini.organizationId),
    organizationId: ini.organizationId,
    recipientTeam: ini.recipientTeam,
    categories: ini.categories,
    stages: ini.stages.map((s) => ({ stage: s.stage, label: STAGE_LABEL[s.stage], primary: s.primary })),
    standards: ini.standards,
    goalCents: ini.funding.goalCents,
    raisedCents: ini.funding.officialRaisedCents,
    pledgedCents: ini.funding.pledgedCents,
    donatedCents: ini.funding.donatedCents,
    receivedCents: ini.funding.receivedCents,
    remainingCents: ini.funding.remainingCents,
    theDaoAskCents: ini.funding.theDaoAskCents,
    pct: m["initiative.pct_funded"]?.value ?? null,
    backers: m["initiative.backers"]?.value ?? 0,
    milestones: ms.length,
    adoptionMilestones: ms.filter((x) => x.adoption).length,
    adoptionShare: m["initiative.adoption_share"]?.value ?? null,
    completedMilestones: ms.filter((x) => x.done).length,
    questions: ms.reduce((s, x) => s + x.questions.length, 0),
    publicRepos: repos.length,
    reachableProducts: products.length,
    hasExistingWork: cl.some((c) => (c.kind === "existing_artifact" || c.kind === "milestone_completed") && PRESENT_SUPPORTED.includes(c.status)) || products.length > 0,
    evidenceCoverage: m["initiative.evidence_coverage"]?.value ?? null,
    supportedClaims: cl.filter((c) => PRESENT_SUPPORTED.includes(c.status)).length,
    claimCount: cl.length,
    plannedIntegrations: cl.filter((c) => c.kind === "integration" && c.status === "future_target").length,
    researchComplete: tasks.every((t) => d.researchJobs.some((j) => j.initiativeId === ini.id && j.task === t && j.state === "succeeded")),
    onBallot: ini.onBallot,
    eligibilityNote: ini.eligibilityNote,
    durationMonths: ini.durationMonths,
    url: ini.url,
    affiliatedWith: sharedGroupsOf(d, ini.id),
  };
}

/**
 * One-sentence plain-language explanation shown at the top of a dossier: the opening sentence
 * of the official summary, copied verbatim (the truth audit checks it is a prefix of the raw
 * official summary). A very short opening sentence is joined with the next one.
 */
export function plainExplanation(ini: Pick<Initiative, "summary">): string {
  const text = ini.summary.replace(/\s+/g, " ").trim();
  const parts = text.split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/);
  const first = parts[0] ?? text;
  if (first.length < 40 && parts[1]) return `${first} ${parts[1]}`;
  return first;
}

export interface PaletteClaimHit {
  id: string;
  initiativeSlug: string;
  initiative: string;
  assertion: string;
  status: EvidenceStatus;
}

/** Claim search for the command palette: every query token must appear in the claim text. */
export function searchClaims(d: Dataset, q: string, limit = 8): PaletteClaimHit[] {
  const tokens = q.toLowerCase().split(/\s+/).filter((t) => t.length >= 2).slice(0, 8);
  if (!tokens.length) return [];
  const out: PaletteClaimHit[] = [];
  for (const c of d.claims) {
    const hay = `${c.assertion} ${c.quote ?? ""}`.toLowerCase();
    if (!tokens.every((t) => hay.includes(t))) continue;
    const ini = d.initiatives.find((i) => i.id === c.initiativeId);
    if (!ini) continue;
    out.push({ id: c.id, initiativeSlug: ini.slug, initiative: ini.shortTitle, assertion: c.assertion.length > 200 ? `${c.assertion.slice(0, 199)}…` : c.assertion, status: c.status });
    if (out.length >= limit) break;
  }
  return out;
}

export const FilterSchema = z
  .object({
    q: z.string().trim().max(200).optional(),
    categories: z.array(z.string().max(60)).max(20).optional(),
    stages: z.array(z.enum(SECURITY_PROBLEMS.map((p) => p.id) as [LifecycleStage, ...LifecycleStage[]])).max(11).optional(),
    type: z.enum(["grant", "rfp"]).optional(),
    goalMinUsd: z.number().nonnegative().optional(),
    goalMaxUsd: z.number().nonnegative().optional(),
    fundedMinPct: z.number().min(0).max(100).optional(),
    fundedMaxPct: z.number().min(0).max(100).optional(),
    existingWork: z.boolean().optional(),
    hasSupportedEvidence: z.boolean().optional(),
    adoption: z.enum(["any", "has", "none"]).optional(),
    hasCompletedMilestone: z.boolean().optional(),
    hasPlannedIntegrations: z.boolean().optional(),
    researchComplete: z.boolean().optional(),
    standard: z.string().max(20).optional(),
    organizationId: z.string().max(120).optional(),
    /** Initiatives with at least one similar-initiative pair: any label, or only "Possible overlap" / "Possible complement". */
    similar: z.enum(["any", "overlap", "complement"]).optional(),
    sort: z.enum(["title", "goal", "raised", "pct", "ask", "remaining", "milestones"]).optional(),
    order: z.enum(["asc", "desc"]).optional(),
    limit: z.number().int().min(1).max(100).optional(),
    offset: z.number().int().min(0).optional(),
  })
  .strict();
export type Filter = z.infer<typeof FilterSchema>;

let searchCache: { version: string; index: ReturnType<typeof buildBm25> } | null = null;

export function searchIndex(d: Dataset) {
  if (searchCache?.version === d.meta.datasetVersion) return searchCache.index;
  const index = buildBm25(
    d.initiatives.map((i) => ({
      id: i.id,
      text: [
        i.title,
        i.title,
        i.summary,
        orgName(d, i.organizationId) ?? "",
        i.recipientTeam ?? "",
        i.categories.map((c) => c.label).join(" "),
        i.stages.map((s) => STAGE_LABEL[s.stage]).join(" "),
        i.standards.join(" "),
        ...i.sections.map((s) => s.markdown),
        ...d.milestones.filter((m) => m.initiativeId === i.id).map((m) => m.name),
        ...d.repositories.filter((r) => r.initiativeIds.includes(i.id)).map((r) => `${r.fullName} ${r.language ?? ""}`),
      ].join("\n"),
    })),
  );
  searchCache = { version: d.meta.datasetVersion, index };
  return index;
}

export function filterInitiatives(d: Dataset, f: Filter = {}) {
  let rows = d.initiatives.map((i) => summarize(d, i));
  let relevance: Map<string, { score: number; matched: string[] }> | null = null;
  if (f.q) {
    const hits = searchBm25(searchIndex(d), f.q, 55);
    relevance = new Map(hits.map((h) => [h.id, { score: h.score, matched: h.matched }]));
    rows = rows.filter((r) => relevance?.has(r.id));
  }
  if (f.categories?.length) rows = rows.filter((r) => r.categories.some((c) => f.categories?.includes(c.slug)));
  if (f.stages?.length) rows = rows.filter((r) => r.stages.some((s) => f.stages?.includes(s.stage)));
  if (f.type) rows = rows.filter((r) => r.type === f.type);
  if (f.goalMinUsd !== undefined) rows = rows.filter((r) => r.goalCents >= (f.goalMinUsd as number) * 100);
  if (f.goalMaxUsd !== undefined) rows = rows.filter((r) => r.goalCents <= (f.goalMaxUsd as number) * 100);
  if (f.fundedMinPct !== undefined) rows = rows.filter((r) => (r.pct ?? 0) * 100 >= (f.fundedMinPct as number));
  if (f.fundedMaxPct !== undefined) rows = rows.filter((r) => (r.pct ?? 0) * 100 <= (f.fundedMaxPct as number));
  if (f.existingWork !== undefined) rows = rows.filter((r) => r.hasExistingWork === f.existingWork);
  if (f.hasSupportedEvidence !== undefined) rows = rows.filter((r) => r.supportedClaims > 0 === f.hasSupportedEvidence);
  if (f.adoption === "has") rows = rows.filter((r) => r.adoptionMilestones > 0);
  if (f.adoption === "none") rows = rows.filter((r) => r.adoptionMilestones === 0);
  if (f.hasCompletedMilestone !== undefined) rows = rows.filter((r) => r.completedMilestones > 0 === f.hasCompletedMilestone);
  if (f.hasPlannedIntegrations !== undefined) rows = rows.filter((r) => r.plannedIntegrations > 0 === f.hasPlannedIntegrations);
  if (f.researchComplete !== undefined) rows = rows.filter((r) => r.researchComplete === f.researchComplete);
  if (f.standard) rows = rows.filter((r) => r.standards.includes((f.standard as string).toUpperCase()));
  if (f.organizationId) rows = rows.filter((r) => r.organizationId === f.organizationId);
  if (f.similar) {
    const labels = similarLabelsById(d);
    const want: SimilarLabel | null = f.similar === "overlap" ? "Possible overlap" : f.similar === "complement" ? "Possible complement" : null;
    rows = rows.filter((r) => {
      const l = labels.get(r.id);
      return !!l && (want ? l.has(want) : l.size > 0);
    });
  }
  const sort = f.sort ?? (relevance ? null : "title");
  const dir = f.order === "desc" ? -1 : 1;
  if (sort) {
    const key: Record<string, (r: InitiativeSummary) => number | string> = {
      title: (r) => r.title.toLowerCase(),
      goal: (r) => r.goalCents,
      raised: (r) => r.raisedCents,
      pct: (r) => r.pct ?? -1,
      ask: (r) => r.theDaoAskCents ?? -1,
      remaining: (r) => r.remainingCents,
      milestones: (r) => r.milestones,
    };
    const k = key[sort] as (r: InitiativeSummary) => number | string;
    rows.sort((a, b) => (k(a) < k(b) ? -dir : k(a) > k(b) ? dir : a.title.localeCompare(b.title)));
  } else if (relevance) {
    rows.sort((a, b) => (relevance?.get(b.id)?.score ?? 0) - (relevance?.get(a.id)?.score ?? 0));
  }
  const total = rows.length;
  const offset = f.offset ?? 0;
  const limit = f.limit ?? 100;
  return {
    total,
    offset,
    limit,
    sort: sort ?? "relevance",
    sortNote: sort === "title" ? `${NEUTRAL_SORT_LABEL}: by official title, the default order. No ranking.` : sort ? `Sorted by ${sort} (${f.order ?? "asc"}), chosen by the user.` : "Ordered by lexical relevance to the search query (BM25).",
    items: rows.slice(offset, offset + limit).map((r) => ({ ...r, matchedTerms: relevance?.get(r.id)?.matched ?? [] })),
  };
}

// ───────────────────────────── Dossier ─────────────────────────────

export function relatedHypotheses(d: Dataset, id: string) {
  return d.relationships
    .filter((r) => (r.type === "potentially_overlaps" || r.type === "potentially_complements") && (r.from.id === id || r.to.id === id))
    .map((r) => {
      const other = r.from.id === id ? r.to.id : r.from.id;
      const o = d.initiatives.find((i) => i.id === other);
      return { relationship: r, other: o ? { id: o.id, slug: o.slug, title: o.title, shortTitle: o.shortTitle } : null };
    });
}

export function maintenanceStatements(ini: Initiative): string[] {
  const out: string[] = [];
  for (const s of ini.sections) for (const t of sentences(s.markdown)) if (/\bmaint(ain|ains|ained|aining|enance|ainer|ainers)\b/i.test(t)) out.push(t);
  return out.slice(0, 6);
}

/** Proposal sentences that name who would use or benefit from the work (quoted, rule-based selection). */
export function beneficiaryStatements(ini: Initiative): string[] {
  const out: string[] = [];
  const re = /\b(benefit|benefits|beneficiar(y|ies)|end users|users|developers|auditors|signers|researchers|protocol teams|client teams|wallet teams)\b/i;
  for (const s of ini.sections.filter((x) => ["who", "why", "in_scope"].includes(x.key))) for (const t of sentences(s.markdown)) if (re.test(t)) out.push(t);
  return out.slice(0, 4);
}

export function dossier(d: Dataset, idOrSlug: string) {
  const ini = findInitiative(d, idOrSlug);
  if (!ini) return null;
  const org = d.organizations.find((o) => o.id === ini.organizationId) ?? null;
  const milestones = d.milestones.filter((m) => m.initiativeId === ini.id).sort((a, b) => a.index - b.index);
  const claims = d.claims.filter((c) => c.initiativeId === ini.id);
  const evIds = new Set(claims.flatMap((c) => c.evidenceIds));
  const evidence = d.evidence.filter((e) => evIds.has(e.id));
  const pledges = d.pledges.filter((p) => p.initiativeId === ini.id);
  const backers = [...new Set(pledges.map((p) => p.backerId))].map((bid) => d.organizations.find((o) => o.id === bid)).filter((x) => !!x);
  const repos = d.repositories.filter((r) => r.initiativeIds.includes(ini.id));
  const products = d.products.filter((p) => p.initiativeIds.includes(ini.id));
  const people = d.people.filter((p) => p.initiativeIds.includes(ini.id));
  const metrics = initiativeMetrics(d, ini);
  const reality = realityVsPromises(d, ini, milestones, claims);
  return {
    initiative: ini,
    organization: org,
    aliases: d.aliases.filter((a) => a.organizationId === ini.organizationId || a.candidateOrganizationId === ini.organizationId),
    milestones,
    claims,
    evidence,
    pledges,
    backers,
    donations: d.donations.filter((x) => x.initiativeId === ini.id),
    repositories: repos,
    products,
    people,
    integrations: d.integrations.filter((x) => x.initiativeId === ini.id),
    previousGrants: d.previousGrants.filter((x) => x.initiativeId === ini.id),
    related: relatedHypotheses(d, ini.id),
    changes: d.changes.filter((c) => c.initiativeId === ini.id),
    revisions: d.revisions.filter((r) => r.initiativeId === ini.id).sort((a, b) => b.n - a.n),
    metrics,
    reality,
    blindSpots: blindSpots(d).filter((b) => b.initiativeId === ini.id),
    maintenance: maintenanceStatements(ini),
    researchJobs: d.researchJobs.filter((j) => j.initiativeId === ini.id),
  };
}
export type Dossier = NonNullable<ReturnType<typeof dossier>>;

export function realityVsPromises(d: Dataset, ini: Initiative, milestones: Milestone[], claims: Claim[]) {
  const existing = claims.filter((c) => c.origin !== "ai" && (c.kind === "existing_artifact" || c.kind === "milestone_completed" || c.kind === "donation") && PRESENT_SUPPORTED.includes(c.status));
  const statedExisting = claims.filter((c) => c.origin !== "ai" && (c.kind === "integration" || c.kind === "quantitative") && c.status === "applicant_reported");
  const proposed = milestones.filter((m) => !m.done && !m.adoption);
  const adoption = milestones.filter((m) => !m.done && m.adoption);
  const dependencies = [
    ...d.relationships
      .filter((r) => r.from.id === ini.id && r.type === "depends_on")
      .map((r) => ({ label: r.to.id, reason: r.reason, kind: "standard" as const })),
    ...claims.filter((c) => c.kind === "integration" && c.status === "future_target").map((c) => ({ label: c.assertion, reason: "Planned integration stated in the proposal", kind: "integration" as const })),
    ...adoption.map((m) => ({ label: m.name, reason: "Adoption milestone: payment depends on third-party uptake", kind: "adoption" as const })),
  ];
  return {
    existing,
    statedExisting,
    products: d.products.filter((p) => p.initiativeIds.includes(ini.id)),
    proposed,
    adoption,
    dependencies,
    fundingForProposedCents: sumCents(proposed.map((m) => m.amountCents)),
    fundingForAdoptionCents: sumCents(adoption.map((m) => m.amountCents)),
    fundingForCompletedCents: sumCents(milestones.filter((m) => m.done).map((m) => m.amountCents)),
  };
}

// ───────────────────────────── Comparison ─────────────────────────────

export interface CompareRow {
  group: string;
  key: string;
  label: string;
  values: string[];
  differs: boolean;
}

export function compare(d: Dataset, ids: string[]) {
  const inis = ids.map((id) => findInitiative(d, id)).filter((x): x is Initiative => !!x).slice(0, 5);
  const sums = inis.map((i) => summarize(d, i));
  const mets = inis.map((i) => initiativeMetrics(d, i));
  const rows: CompareRow[] = [];
  const row = (group: string, key: string, label: string, values: string[]) => rows.push({ group, key, label, values, differs: new Set(values).size > 1 });
  const pct = (x: number | null | undefined) => (x === null || x === undefined ? "Unavailable" : `${(x * 100).toFixed(1)}%`);
  row("Overview", "type", "Type", sums.map((s) => (s.type === "rfp" ? "RFP" : "Grant")));
  row("Overview", "org", "Recipient", sums.map((s) => s.organization ?? s.recipientTeam ?? "No designated recipient (RFP)"));
  row("Overview", "categories", "Official categories", sums.map((s) => s.categories.map((c) => c.label).join(", ")));
  row("Security problem", "primary", "Primary lifecycle stage (rule-based)", sums.map((s) => s.stages.find((x) => x.primary)?.label ?? "—"));
  row("Security problem", "stages", "All lifecycle stages (rule-based)", sums.map((s) => s.stages.map((x) => x.label).join(", ")));
  row("Security problem", "summary", "Official summary", inis.map((i) => i.summary));
  row("Milestones", "count", "Milestones", sums.map((s) => String(s.milestones)));
  row("Milestones", "names", "Milestone deliverables", inis.map((i) => d.milestones.filter((m) => m.initiativeId === i.id).sort((a, b) => a.index - b.index).map((m) => m.name).join("\n")));
  row("Milestones", "completed", "Completed milestones", sums.map((s) => String(s.completedMilestones)));
  row("Milestones", "duration", "Duration", sums.map((s) => (s.durationMonths ? `${s.durationMonths} months` : "Not stated")));
  row("Adoption", "adoption", "Adoption milestones", sums.map((s) => String(s.adoptionMilestones)));
  row("Evidence", "existing", "Existing work with supporting evidence", sums.map((s) => (s.hasExistingWork ? "Yes" : "None found")));
  row("Evidence", "supported", "Claims with supporting evidence", sums.map((s) => `${s.supportedClaims} of ${s.claimCount}`));
  row("Evidence", "coverage", "Evidence coverage", sums.map((s) => pct(s.evidenceCoverage)));
  row("Existing work", "products", "Reachable products and sites", inis.map((i) => d.products.filter((p) => p.initiativeIds.includes(i.id) && p.reachable).map((p) => p.title ?? p.name).join("\n") || "None found"));
  row("Technical", "repos", "Public repositories cited", sums.map((s) => String(s.publicRepos)));
  row("Technical", "repoNames", "Repositories cited (architecture)", inis.map((i) => d.repositories.filter((r) => r.initiativeIds.includes(i.id) && r.exists).map((r) => `${r.fullName}${r.language ? ` (${r.language})` : ""}`).join("\n") || "None found"));
  row("Technical", "active", "Repositories with commits in 90 days", mets.map((m) => String(m["initiative.repos_active_90d"]?.value ?? 0)));
  row("Technical", "ci", "Repositories with CI workflows", mets.map((m) => String(m["initiative.repos_with_ci"]?.value ?? 0)));
  row("Dependencies", "standards", "Standards referenced", sums.map((s) => s.standards.join(", ") || "None found"));
  row("Dependencies", "planned", "Planned integrations stated", sums.map((s) => String(s.plannedIntegrations)));
  row("Dependencies", "integrations", "Integrations stated by the applicant", inis.map((i) => String(d.claims.filter((c) => c.initiativeId === i.id && c.kind === "integration").length)));
  row("Adoption", "adoptionNames", "Adoption commitments (milestones)", inis.map((i) => d.milestones.filter((m) => m.initiativeId === i.id && m.adoption).sort((a, b) => a.index - b.index).map((m) => `${m.name} (${formatUsd(m.amountCents)})`).join("\n") || "None"));
  row("Beneficiaries", "beneficiaries", "Who benefits (quoted)", inis.map((i) => beneficiaryStatements(i).slice(0, 2).join("\n") || "No sentence naming users or beneficiaries found"));
  row("Maintenance", "maintenance", "Maintenance statements (quoted)", inis.map((i) => maintenanceStatements(i).slice(0, 2).join("\n") || "No sentence mentioning maintenance found"));
  const pairIds = new Set(inis.map((i) => i.id));
  const hyps = d.relationships.filter((r) => (r.type === "potentially_overlaps" || r.type === "potentially_complements") && pairIds.has(r.from.id) && pairIds.has(r.to.id));
  return {
    initiatives: sums,
    rows,
    hypotheses: hyps,
    methodology:
      "Every value is copied from the official record or computed from the published dataset. 'Differs' compares rendered values literally. Lifecycle stages and similarity hypotheses are rule-based; see METHODOLOGY.md.",
  };
}

// ───────────────────────────── Coverage ─────────────────────────────

export function coverage(d: Dataset) {
  const stages = SECURITY_PROBLEMS.map((p) => {
    const primary = d.initiatives.filter((i) => i.stages[0]?.stage === p.id);
    const any = d.initiatives.filter((i) => i.stages.some((s) => s.stage === p.id));
    return {
      stage: p.id,
      label: p.label,
      description: p.description,
      oneTs: STAGE_ONE_TS[p.id].map((k) => ONE_TS_DOMAINS[k]),
      primaryCount: primary.length,
      totalCount: any.length,
      primaryGoalCents: sumCents(primary.map((i) => i.funding.goalCents)),
      initiatives: any.map((i) => ({ id: i.id, slug: i.slug, shortTitle: i.shortTitle, primary: i.stages[0]?.stage === p.id, terms: i.stages.find((s) => s.stage === p.id)?.matchedTerms ?? [] })),
    };
  });
  const max = Math.max(...stages.map((s) => s.totalCount));
  return {
    stages,
    fewest: stages.filter((s) => s.totalCount <= 3).map((s) => s.label),
    most: stages.filter((s) => s.totalCount === max).map((s) => s.label),
    note: "Counts describe this ballot cohort only. A stage with few initiatives here may be well served elsewhere in the ecosystem; this view does not measure that.",
  };
}

export function categoryDistribution(d: Dataset) {
  const map = new Map<string, { slug: string; label: string; primaryCount: number; count: number; goalCents: number; raisedCents: number }>();
  for (const i of d.initiatives) {
    i.categories.forEach((c, idx) => {
      const e = map.get(c.slug) ?? { slug: c.slug, label: c.label, primaryCount: 0, count: 0, goalCents: 0, raisedCents: 0 };
      e.count++;
      if (idx === 0) {
        e.primaryCount++;
        e.goalCents += i.funding.goalCents;
        e.raisedCents += i.funding.officialRaisedCents;
      }
      map.set(c.slug, e);
    });
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
}

// ───────────────────────────── Blind spots ─────────────────────────────

export interface BlindSpot {
  id: string;
  initiativeId: string;
  category: "unsupported_material_claim" | "adoption_dependency" | "unclear_criterion" | "possible_overlap" | "maintenance_statement_absent" | "no_linked_existing_work" | "unconfirmed_integration";
  importance: "higher" | "standard";
  question: string;
  basis: string;
  refs: string[];
}

export const BLIND_SPOT_LABEL: Record<BlindSpot["category"], string> = {
  unsupported_material_claim: "Statement without independent support",
  adoption_dependency: "Adoption dependency",
  unclear_criterion: "Brief acceptance criterion",
  possible_overlap: "Possible overlap (hypothesis)",
  maintenance_statement_absent: "Maintenance not described",
  no_linked_existing_work: "No linked existing work",
  unconfirmed_integration: "Integration not confirmed",
};

export function blindSpots(d: Dataset): BlindSpot[] {
  const out: BlindSpot[] = [];
  for (const ini of d.initiatives) {
    const ms = d.milestones.filter((m) => m.initiativeId === ini.id);
    for (const m of ms) {
      if (m.adoption && !m.done)
        out.push({
          id: `bs_${m.id}_adoption`,
          initiativeId: ini.id,
          category: "adoption_dependency",
          importance: (m.shareOfGoal ?? 0) >= 0.25 ? "higher" : "standard",
          question: `“${m.name}” is an adoption milestone (${formatUsd(m.amountCents)}, ${((m.shareOfGoal ?? 0) * 100).toFixed(0)}% of goal). Which third parties must adopt it, and has any confirmed publicly?`,
          basis: "Official milestone record: adoption = true.",
          refs: [m.id],
        });
      for (const q of m.questions.filter((x) => x.code === "short_criteria" || x.code === "no_criteria"))
        out.push({ id: `bs_${m.id}_${q.code}`, initiativeId: ini.id, category: "unclear_criterion", importance: "standard", question: `“${m.name}”: ${q.question}`, basis: `Acceptance criterion as recorded: “${m.criteria.join(" ") || "none"}”`, refs: [m.id] });
    }
    for (const c of d.claims.filter((x) => x.initiativeId === ini.id)) {
      if (c.kind === "integration" && c.status === "applicant_reported" && c.origin !== "ai")
        out.push({ id: `bs_${c.id}`, initiativeId: ini.id, category: "unconfirmed_integration", importance: "higher", question: "Can the counterparty publicly confirm this integration, and where can it be observed?", basis: c.assertion, refs: [c.id] });
      if (c.kind === "quantitative" && c.status === "applicant_reported" && c.origin !== "ai")
        out.push({ id: `bs_${c.id}`, initiativeId: ini.id, category: "unsupported_material_claim", importance: "standard", question: "Which public source supports this figure?", basis: c.assertion, refs: [c.id] });
    }
    if (maintenanceStatements(ini).length === 0)
      out.push({ id: `bs_${ini.id}_maint`, initiativeId: ini.id, category: "maintenance_statement_absent", importance: "standard", question: "Who maintains the deliverables after funding ends, and how is that funded?", basis: "No sentence in the proposal text contains the word “maintain” or “maintenance”.", refs: [] });
    const s = summarize(d, ini);
    // Only after the checks ran: missing research is "Not yet researched", never a gap (Item 14).
    const checked = (["github", "websites"] as const).every((t) => d.researchJobs.some((j) => j.initiativeId === ini.id && j.task === t && j.state === "succeeded"));
    if (ini.type === "grant" && checked && !s.hasExistingWork)
      out.push({ id: `bs_${ini.id}_existing`, initiativeId: ini.id, category: "no_linked_existing_work", importance: "higher", question: "What exists today, and where can reviewers inspect it?", basis: "The research pipeline found no cited public repository confirmed public, no completed milestone and no reachable recipient-domain page.", refs: [] });
  }
  for (const r of d.relationships.filter((x) => x.type === "potentially_overlaps")) {
    const a = d.initiatives.find((i) => i.id === r.from.id);
    const b = d.initiatives.find((i) => i.id === r.to.id);
    if (a && b)
      out.push({ id: `bs_${r.id}`, initiativeId: a.id, category: "possible_overlap", importance: "standard", question: `Which deliverables of ${a.shortTitle} and ${b.shortTitle} would substitute for each other, and which are complementary?`, basis: r.reason, refs: [r.id, b.id] });
  }
  return out;
}

// ───────────────────────────── Funding relationships ─────────────────────────────

export function fundingRelationships(d: Dataset) {
  const byBacker = new Map<string, { backerId: string; name: string; anonymous: boolean; totalCents: number; pledgedCents: number; receivedCents: number; initiatives: Set<string>; records: number }>();
  for (const p of d.pledges) {
    const org = d.organizations.find((o) => o.id === p.backerId);
    const e = byBacker.get(p.backerId) ?? { backerId: p.backerId, name: org?.name ?? p.company, anonymous: org?.anonymous ?? false, totalCents: 0, pledgedCents: 0, receivedCents: 0, initiatives: new Set<string>(), records: 0 };
    e.totalCents += p.amountCents;
    if (p.status === "pledged") e.pledgedCents += p.amountCents;
    else e.receivedCents += p.amountCents;
    e.initiatives.add(p.initiativeId);
    e.records++;
    byBacker.set(p.backerId, e);
  }
  const backers = [...byBacker.values()].map((b) => ({ ...b, initiatives: [...b.initiatives] })).sort((a, b) => b.totalCents - a.totalCents || a.name.localeCompare(b.name));
  const total = sumCents(backers.map((b) => b.totalCents));
  const selfPledges = d.pledges
    .filter((p) => {
      const ini = d.initiatives.find((i) => i.id === p.initiativeId);
      return ini?.organizationId && p.backerId === ini.organizationId;
    })
    .map((p) => ({ pledgeId: p.id, initiativeId: p.initiativeId, backer: p.company, amountCents: p.amountCents, status: p.status }));
  return {
    totalPledgedCents: total,
    backers,
    multiInitiativeBackers: backers.filter((b) => b.initiatives.length > 1),
    selfPledges,
    selfPledgeNote: "A self-pledge is a pledge whose backer name resolves (by the identity rules) to the initiative's own recipient organization. It is common and legitimate; it is listed so reviewers can see independent support separately.",
    candidates: d.aliases.filter((a) => a.resolution === "candidate_unconfirmed"),
    concentration: cohortMetrics(d)["cohort.top5_backer_share"],
  };
}

export const FUNDING_IDENTITY =
  "Official raised = outstanding pledges + confirmed donations. Received pledges arrive as donations and are already inside donated; they are never added twice.";

/** Funding breakdown for one initiative: official figures, pledge rows with backer names, donations and financial metrics. */
export function fundingBreakdown(d: Dataset, ini: Initiative) {
  const metrics = Object.fromEntries(
    Object.entries(initiativeMetrics(d, ini)).filter(([k]) => {
      const cat = METRIC_BY_ID.get(k)?.category;
      return cat === "financial" || cat === "concentration";
    }),
  );
  return {
    initiativeId: ini.id,
    slug: ini.slug,
    funding: ini.funding,
    identity: FUNDING_IDENTITY,
    pledges: d.pledges.filter((p) => p.initiativeId === ini.id).map((p) => ({ ...p, backerName: orgName(d, p.backerId) ?? p.company })),
    donations: d.donations.filter((x) => x.initiativeId === ini.id),
    metrics,
  };
}

// ───────────────────────────── Dependencies ─────────────────────────────

export function dependencies(d: Dataset, idOrSlug?: string) {
  const inis = idOrSlug ? [findInitiative(d, idOrSlug)].filter((x): x is Initiative => !!x) : d.initiatives;
  return inis.map((ini) => {
    const rels = d.relationships.filter((r) => r.from.id === ini.id && (r.type === "depends_on" || r.type === "references"));
    const ms = d.milestones.filter((m) => m.initiativeId === ini.id);
    return {
      initiativeId: ini.id,
      shortTitle: ini.shortTitle,
      standards: rels.filter((r) => r.to.type === "standard").map((r) => ({ standard: r.to.id, relation: r.type, reason: r.reason })),
      externalRepositories: rels
        .filter((r) => r.to.type === "repository")
        .map((r) => d.repositories.find((x) => x.id === r.to.id))
        .filter((x) => !!x)
        .map((x) => ({ fullName: x.fullName, url: x.url, maintainedByRecipient: d.relationships.some((r) => r.type === "maintains" && r.to.id === x.id && r.from.id === ini.organizationId) })),
      adoptionMilestones: ms.filter((m) => m.adoption).map((m) => ({ name: m.name, amountCents: m.amountCents, dependencyTerms: m.dependencyTerms })),
      plannedIntegrations: d.claims.filter((c) => c.initiativeId === ini.id && c.kind === "integration" && c.status === "future_target").map((c) => c.assertion),
    };
  });
}

// ───────────────────────────── Changes ─────────────────────────────

export function changes(d: Dataset, opts: { since?: string; initiativeIds?: string[]; kinds?: string[]; limit?: number } = {}) {
  return d.changes
    .filter((c) => !opts.since || c.detectedAt >= opts.since)
    .filter((c) => !opts.initiativeIds?.length || (c.initiativeId && opts.initiativeIds.includes(c.initiativeId)))
    .filter((c) => !opts.kinds?.length || opts.kinds.includes(c.kind))
    .slice(0, opts.limit ?? 200);
}

// ───────────────────────────── Graph ─────────────────────────────

export interface GraphNode {
  id: string;
  type: EntityType;
  label: string;
  sub: string | null;
}
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: Relationship["type"] | "has_milestone";
  confidence: Relationship["confidence"];
  reason: string;
  evidenceIds: string[];
  sourceUrls: string[];
}

export function entityLabel(d: Dataset, type: EntityType, id: string): { label: string; sub: string | null } {
  switch (type) {
    case "initiative": {
      const i = d.initiatives.find((x) => x.id === id);
      return { label: i?.shortTitle ?? id, sub: i ? (i.type === "rfp" ? "RFP" : "Grant") : null };
    }
    case "organization":
    case "backer": {
      const o = d.organizations.find((x) => x.id === id);
      return { label: o?.name ?? id, sub: o ? (o.kind === "both" ? "Recipient & backer" : o.kind === "recipient" ? "Recipient" : "Backer") : null };
    }
    case "repository": {
      const r = d.repositories.find((x) => x.id === id);
      return { label: r?.fullName ?? id, sub: r?.language ?? "Repository" };
    }
    case "person": {
      const p = d.people.find((x) => x.id === id);
      return { label: p?.name ?? id, sub: p?.role ?? "Public profile" };
    }
    case "product": {
      const p = d.products.find((x) => x.id === id);
      return { label: p?.title ?? p?.name ?? id, sub: p ? new URL(p.url).hostname : null };
    }
    case "problem":
      return { label: STAGE_LABEL[id as LifecycleStage] ?? id, sub: "Lifecycle stage" };
    case "standard":
      return { label: id, sub: "Standard" };
    case "milestone": {
      const m = d.milestones.find((x) => x.id === id);
      return { label: m?.name ?? id, sub: m ? formatUsd(m.amountCents) : null };
    }
    default:
      return { label: id, sub: null };
  }
}

export function graphNeighborhood(d: Dataset, root: { type: EntityType; id: string }, opts: { depth?: number; types?: Relationship["type"][]; includeInferred?: boolean; includeMilestones?: boolean } = {}) {
  const depth = Math.min(opts.depth ?? 1, 2);
  const includeInferred = opts.includeInferred ?? true;
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const key = (t: EntityType, id: string) => `${t === "backer" ? "organization" : t}:${id}`;
  const addNode = (t: EntityType, id: string) => {
    const k = key(t, id);
    if (!nodes.has(k)) nodes.set(k, { id: k, type: t === "backer" ? "organization" : t, ...entityLabel(d, t, id) });
    return k;
  };
  addNode(root.type, root.id);
  let frontier = [key(root.type, root.id)];
  for (let level = 0; level < depth; level++) {
    const next: string[] = [];
    for (const k of frontier) {
      const [t, ...rest] = k.split(":");
      const id = rest.join(":");
      for (const r of d.relationships) {
        if (!includeInferred && r.confidence === "inferred") continue;
        if (opts.types?.length && !opts.types.includes(r.type)) continue;
        const fromK = key(r.from.type, r.from.id);
        const toK = key(r.to.type, r.to.id);
        if (fromK !== k && toK !== k) continue;
        const a = addNode(r.from.type, r.from.id);
        const b = addNode(r.to.type, r.to.id);
        edges.set(r.id, { id: r.id, source: a, target: b, type: r.type, confidence: r.confidence, reason: r.reason, evidenceIds: r.evidenceIds, sourceUrls: r.sourceUrls });
        next.push(a === k ? b : a);
      }
      if (opts.includeMilestones && t === "initiative") {
        const url = d.initiatives.find((x) => x.id === id)?.url;
        for (const m of d.milestones.filter((x) => x.initiativeId === id)) {
          const mk = addNode("milestone", m.id);
          edges.set(`ms-${m.id}`, { id: `ms-${m.id}`, source: k, target: mk, type: "has_milestone", confidence: "confirmed", reason: "Official milestone record", evidenceIds: [], sourceUrls: url ? [url] : [] });
        }
      }
    }
    frontier = [...new Set(next)].slice(0, 60);
  }
  return { nodes: [...nodes.values()].slice(0, 150), edges: [...edges.values()].filter((e) => nodes.has(e.source) && nodes.has(e.target)).slice(0, 300) };
}

export function entityProfile(d: Dataset, type: EntityType, id: string) {
  if (type === "initiative") {
    const i = findInitiative(d, id);
    return i ? { type, initiative: summarize(d, i) } : null;
  }
  if (type === "organization" || type === "backer") {
    const o = d.organizations.find((x) => x.id === id);
    if (!o) return null;
    return {
      type: "organization" as const,
      organization: o,
      aliases: d.aliases.filter((a) => a.organizationId === o.id || a.candidateOrganizationId === o.id),
      proposes: d.initiatives.filter((i) => i.organizationId === o.id).map((i) => ({ id: i.id, slug: i.slug, shortTitle: i.shortTitle, title: i.title })),
      pledges: d.pledges.filter((p) => p.backerId === o.id).map((p) => ({ ...p, initiative: d.initiatives.find((i) => i.id === p.initiativeId)?.shortTitle ?? p.initiativeId })),
      people: d.people.filter((p) => p.organizationId === o.id),
      repositories: d.repositories.filter((r) => d.relationships.some((x) => x.type === "maintains" && x.from.id === o.id && x.to.id === r.id)),
      round1: round1ForOrganization(d, o.id),
    };
  }
  if (type === "repository") {
    const r = d.repositories.find((x) => x.id === id);
    return r ? { type, repository: r, initiatives: d.initiatives.filter((i) => r.initiativeIds.includes(i.id)).map((i) => ({ id: i.id, slug: i.slug, shortTitle: i.shortTitle })) } : null;
  }
  if (type === "person") {
    const p = d.people.find((x) => x.id === id);
    return p ? { type, person: p, initiatives: d.initiatives.filter((i) => p.initiativeIds.includes(i.id)).map((i) => ({ id: i.id, slug: i.slug, shortTitle: i.shortTitle })) } : null;
  }
  if (type === "problem") {
    const c = coverage(d).stages.find((s) => s.stage === id);
    return c ? { type, stage: c } : null;
  }
  if (type === "standard") {
    const inis = d.initiatives.filter((i) => i.standards.includes(id));
    return { type, standard: id, initiatives: inis.map((i) => ({ id: i.id, slug: i.slug, shortTitle: i.shortTitle })), url: id.startsWith("ERC") || id.startsWith("EIP") ? `https://eips.ethereum.org/EIPS/eip-${id.split("-")[1]}` : null };
  }
  if (type === "product") {
    const p = d.products.find((x) => x.id === id);
    return p ? { type, product: p } : null;
  }
  if (type === "milestone") {
    const m = d.milestones.find((x) => x.id === id);
    return m ? { type, milestone: m, initiative: d.initiatives.find((i) => i.id === m.initiativeId)?.shortTitle } : null;
  }
  return null;
}

// ───────────────────────────── Claims & impact trace ─────────────────────────────

export function traceClaim(d: Dataset, claimId: string) {
  const claim = d.claims.find((c) => c.id === claimId);
  if (!claim) return null;
  const ini = d.initiatives.find((i) => i.id === claim.initiativeId);
  const evidence = d.evidence.filter((e) => claim.evidenceIds.includes(e.id));
  const metrics: string[] = [];
  if (claim.material && claim.origin !== "ai" && !["future_target", "officially_reported", "not_applicable"].includes(claim.status)) metrics.push("initiative.evidence_coverage");
  if (claim.kind === "funding_pledge" || claim.kind === "funding_received") metrics.push("initiative.backers", "initiative.top_backer_share", "initiative.backer_hhi", "initiative.self_pledged", "cohort.top5_backer_share");
  if (claim.kind === "donation") metrics.push("cohort.donations_verified");
  if (claim.kind === "existing_artifact") metrics.push("initiative.repos_public", "initiative.repos_active_90d", "initiative.repos_with_ci");
  const spots = blindSpots(d).filter((b) => b.refs.includes(claim.id));
  return {
    claim,
    statusLabel: EVIDENCE_STATUS_LABEL[claim.status],
    initiative: ini ? { id: ini.id, slug: ini.slug, title: ini.title } : null,
    evidence,
    impact: {
      metrics,
      views: [
        ini ? `Initiative dossier: /initiatives/${ini.slug}` : null,
        "Reality vs. Promises panel",
        claim.kind === "existing_artifact" || claim.kind === "milestone_completed" ? "Existing-work filter in Research" : null,
        spots.length ? `Research blind spots (${spots.length})` : null,
        "Comparison rows: Evidence group",
      ].filter((x): x is string => !!x),
      organizationProfile: ini?.organizationId ?? null,
      comparisonsInvolving: relatedHypotheses(d, claim.initiativeId).map((h) => h.other?.shortTitle).filter(Boolean),
      exports: ["Evidence bundle exports that include this initiative", "Generated SKILL.md research packs (they read live data via MCP/API)"],
      mcpTools: ["get_initiative", "get_claim", "find_evidence_gaps", "compare_initiatives", "export_research"],
    },
  };
}

// ───────────────────────────── Portfolio scenario ─────────────────────────────

export const ScenarioSchema = z
  .object({
    initiativeIds: z.array(z.string().max(80)).min(1).max(55),
    budgetUsd: z.number().nonnegative().max(1e9).optional(),
    pledgeConversion: z.number().min(0).max(1).default(1),
    excludeAdoptionMilestones: z.boolean().default(false),
    adoptionDelayMonths: z.number().int().min(0).max(36).default(0),
    milestoneDelayMonths: z.number().int().min(0).max(36).default(0),
    treatPlannedIntegrationsAsUnavailable: z.boolean().default(false),
    extraFundingUsd: z.record(z.string(), z.number().min(0).max(1e8)).default({}),
    /** Integrations stated by the applicant without independent support are treated as unavailable. */
    treatUnconfirmedIntegrationsAsUnavailable: z.boolean().default(false),
    /** Standards (e.g. ERC-7730) assumed unavailable or not yet final. */
    unavailableStandards: z.array(z.string().max(20)).max(40).default([]),
    /** Collaboration hypotheses (relationship ids) the user assumes will happen. */
    assumedCollaborations: z.array(z.string().max(60)).max(60).default([]),
  })
  .strict();
export type Scenario = z.infer<typeof ScenarioSchema>;

export function simulatePortfolio(d: Dataset, input: z.input<typeof ScenarioSchema>) {
  const s = ScenarioSchema.parse(input);
  const rows = s.initiativeIds
    .map((id) => findInitiative(d, id))
    .filter((x): x is Initiative => !!x)
    .map((ini) => {
      const ms = d.milestones.filter((m) => m.initiativeId === ini.id);
      const adoptionCents = sumCents(ms.filter((m) => m.adoption && !m.done).map((m) => m.amountCents));
      const scopeCents = s.excludeAdoptionMilestones ? ini.funding.goalCents - adoptionCents : ini.funding.goalCents;
      const extra = Math.round((s.extraFundingUsd[ini.id] ?? s.extraFundingUsd[ini.slug] ?? 0) * 100);
      const securedCents = ini.funding.donatedCents + Math.round(ini.funding.pledgedCents * s.pledgeConversion) + extra;
      const gapCents = Math.max(0, scopeCents - securedCents);
      const planned = d.claims.filter((c) => c.initiativeId === ini.id && c.kind === "integration" && c.status === "future_target");
      const dependsOn: string[] = [];
      if (s.pledgeConversion < 1 && ini.funding.pledgedCents > 0) dependsOn.push("Outstanding pledges converting to funds");
      if (adoptionCents > 0) dependsOn.push(s.excludeAdoptionMilestones ? "Adoption milestones excluded from scope" : `Third-party adoption (${formatUsd(adoptionCents)} of milestones)`);
      if (planned.length) dependsOn.push(s.treatPlannedIntegrationsAsUnavailable ? `${planned.length} planned integration(s) treated as unavailable` : `${planned.length} planned integration(s)`);
      const unconfirmed = d.claims.filter((c) => c.initiativeId === ini.id && c.kind === "integration" && !PRESENT_SUPPORTED.includes(c.status));
      if (s.treatUnconfirmedIntegrationsAsUnavailable && unconfirmed.length) dependsOn.push(`${unconfirmed.length} applicant-stated integration(s) treated as unavailable`);
      const standards = d.relationships.filter((r) => r.from.id === ini.id && r.type === "depends_on" && r.to.type === "standard").map((r) => r.to.id);
      const missingStandards = standards.filter((x) => s.unavailableStandards.includes(x));
      if (missingStandards.length) dependsOn.push(`Depends on ${missingStandards.join(", ")}, assumed unavailable`);
      const collaborations = d.relationships
        .filter((r) => s.assumedCollaborations.includes(r.id) && (r.type === "potentially_overlaps" || r.type === "potentially_complements") && (r.from.id === ini.id || r.to.id === ini.id))
        .map((r) => {
          const other = d.initiatives.find((x) => x.id === (r.from.id === ini.id ? r.to.id : r.from.id));
          return { relationshipId: r.id, kind: r.type, with: other?.shortTitle ?? "another initiative" };
        });
      for (const c of collaborations) dependsOn.push(`Assumed collaboration with ${c.with} (hypothesis, not confirmed)`);
      const baseMonths = ini.durationMonths;
      const months = baseMonths === null ? null : baseMonths + s.milestoneDelayMonths + (adoptionCents > 0 && !s.excludeAdoptionMilestones ? s.adoptionDelayMonths : 0);
      return {
        id: ini.id,
        slug: ini.slug,
        shortTitle: ini.shortTitle,
        goalCents: ini.funding.goalCents,
        pledgedCents: ini.funding.pledgedCents,
        /** Official TheDAO ask today (not affected by scenario assumptions). */
        officialTheDaoAskCents: ini.funding.theDaoAskCents,
        extraCents: extra,
        plannedIntegrations: planned.length,
        scopeCents,
        adoptionCents,
        securedCents,
        gapCents,
        durationMonths: baseMonths,
        adjustedMonths: months,
        dependsOn,
        affectedMilestones:
          s.treatPlannedIntegrationsAsUnavailable || (s.treatUnconfirmedIntegrationsAsUnavailable && unconfirmed.length > 0)
            ? ms.filter((m) => m.dependencyTerms.includes("integrat")).map((m) => m.name)
            : [],
        unconfirmedIntegrations: unconfirmed.length,
        dependsOnStandards: standards,
        unavailableStandards: missingStandards,
        collaborations,
      };
    });
  const ids = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).map((r) => r.id);
  const assumptions = [
    { key: "pledge_conversion", label: `Outstanding pledges convert at ${Math.round(s.pledgeConversion * 100)}%`, active: s.pledgeConversion < 1, affected: ids((r) => r.pledgedCents > 0) },
    { key: "extra_funding", label: "Alternative funding added", active: rows.some((r) => r.extraCents > 0), affected: ids((r) => r.extraCents > 0) },
    { key: "exclude_adoption", label: "Adoption milestones excluded from scope", active: s.excludeAdoptionMilestones, affected: ids((r) => r.adoptionCents > 0) },
    { key: "adoption_delay", label: `Adoption delayed by ${s.adoptionDelayMonths} months`, active: s.adoptionDelayMonths > 0 && !s.excludeAdoptionMilestones, affected: ids((r) => r.adoptionCents > 0 && r.durationMonths !== null) },
    { key: "milestone_delay", label: `All milestones delayed by ${s.milestoneDelayMonths} months`, active: s.milestoneDelayMonths > 0, affected: ids((r) => r.durationMonths !== null) },
    { key: "planned_integrations", label: "Planned integrations unavailable", active: s.treatPlannedIntegrationsAsUnavailable, affected: ids((r) => r.plannedIntegrations > 0) },
    { key: "unconfirmed_integrations", label: "Applicant-stated integrations unavailable", active: s.treatUnconfirmedIntegrationsAsUnavailable, affected: ids((r) => r.unconfirmedIntegrations > 0) },
    { key: "standards", label: `Standards unavailable${s.unavailableStandards.length ? `: ${s.unavailableStandards.join(", ")}` : ""}`, active: s.unavailableStandards.length > 0, affected: ids((r) => r.unavailableStandards.length > 0) },
    { key: "collaboration", label: "Assumed collaborations (hypotheses)", active: s.assumedCollaborations.length > 0, affected: ids((r) => r.collaborations.length > 0) },
  ];
  let remainingBudget = s.budgetUsd === undefined ? null : Math.round(s.budgetUsd * 100);
  const allocation = rows.map((r) => {
    if (remainingBudget === null) return { id: r.id, allocatedCents: null, coversGap: null };
    const a = Math.min(remainingBudget, r.gapCents);
    remainingBudget -= a;
    return { id: r.id, allocatedCents: a, coversGap: a === r.gapCents };
  });
  return {
    scenario: s,
    rows,
    assumptions,
    allocation,
    totals: {
      scopeCents: sumCents(rows.map((r) => r.scopeCents)),
      securedCents: sumCents(rows.map((r) => r.securedCents)),
      gapCents: sumCents(rows.map((r) => r.gapCents)),
      budgetLeftCents: remainingBudget,
    },
    disclaimer:
      "Deterministic arithmetic over your assumptions. This is not a prediction of voting outcomes or delivery. Budget is applied to gaps in the order you listed the initiatives, which is your choice, not advice.",
  };
}

// ───────────────────────────── Collaboration discovery ─────────────────────────────

export interface CollaborationItem {
  relationship: Relationship;
  kind: "potentially_overlaps" | "potentially_complements";
  a: { id: string; slug: string; shortTitle: string; title: string; categories: { slug: string; label: string }[] };
  b: { id: string; slug: string; shortTitle: string; title: string; categories: { slug: string; label: string }[] };
  signals: PairSignals | null;
  reasons: string[];
  questions: string[];
  /** First official category both initiatives share, or null when they share none. */
  sharedCategory: { slug: string; label: string } | null;
}

/**
 * Overlap and complement hypotheses with the deterministic signals that produced them. Signals
 * are recomputed from the published dataset with the same function the pipeline uses (the truth
 * audit checks that the recomputation reproduces the published relationships exactly).
 */
/** Pair signals cached by input identity (never by version string), so a changed dataset is always recomputed. */
const signalCache = new WeakMap<Initiative[], { milestones: Milestone[]; pledges: Dataset["pledges"]; signals: PairSignals[] }>();
function cohortSignals(d: Dataset): PairSignals[] {
  const hit = signalCache.get(d.initiatives);
  if (hit && hit.milestones === d.milestones && hit.pledges === d.pledges) return hit.signals;
  const signals = pairSignals(d.initiatives, d.milestones, d.pledges);
  signalCache.set(d.initiatives, { milestones: d.milestones, pledges: d.pledges, signals });
  return signals;
}

export function collaboration(d: Dataset): CollaborationItem[] {
  const byId = new Map(d.initiatives.map((i) => [i.id, i]));
  const hyps = hypotheses(cohortSignals(d), byId);
  const key = (a: string, b: string) => [a, b].sort().join("|");
  const hypByPair = new Map(hyps.map((h) => [key(h.a, h.b), h]));
  const brief = (i: Initiative) => ({ id: i.id, slug: i.slug, shortTitle: i.shortTitle, title: i.title, categories: i.categories });
  const out: CollaborationItem[] = [];
  for (const r of d.relationships) {
    if (r.type !== "potentially_overlaps" && r.type !== "potentially_complements") continue;
    const a = byId.get(r.from.id);
    const b = byId.get(r.to.id);
    if (!a || !b) continue;
    const h = hypByPair.get(key(a.id, b.id)) ?? null;
    const shared = a.categories.find((c) => b.categories.some((x) => x.slug === c.slug)) ?? null;
    out.push({
      relationship: r,
      kind: r.type,
      a: brief(a),
      b: brief(b),
      signals: h,
      reasons: h?.reasons ?? r.reason.replace(/^overlap@\d+:\s*/, "").split("; "),
      questions: h?.questions ?? [],
      sharedCategory: shared,
    });
  }
  return out.sort((x, y) => (y.signals?.similarity ?? 0) - (x.signals?.similarity ?? 0) || x.a.shortTitle.localeCompare(y.a.shortTitle));
}

/** Deterministic signals for every pair among the given initiatives, whether or not they pass the hypothesis thresholds. */
export function pairDetails(d: Dataset, ids: string[]) {
  const inis = [...new Map(ids.map((x) => findInitiative(d, x)).filter((x): x is Initiative => !!x).map((i) => [i.id, i])).values()].slice(0, 8);
  const set = new Set(inis.map((i) => i.id));
  const all = cohortSignals(d).filter((p) => set.has(p.a) && set.has(p.b));
  const rel = (a: string, b: string) => d.relationships.find((r) => (r.type === "potentially_overlaps" || r.type === "potentially_complements") && ((r.from.id === a && r.to.id === b) || (r.from.id === b && r.to.id === a)));
  return all.map((p) => ({ ...p, hypothesis: rel(p.a, p.b) ?? null }));
}

// ───────────────────────────── Export ─────────────────────────────

export function exportBundle(d: Dataset, ids?: string[]) {
  const inis = ids?.length ? ids.map((x) => findInitiative(d, x)).filter((x): x is Initiative => !!x) : d.initiatives;
  const set = new Set(inis.map((i) => i.id));
  const claims = d.claims.filter((c) => set.has(c.initiativeId));
  const evIds = new Set(claims.flatMap((c) => c.evidenceIds));
  return {
    format: "ethsecurity-intelligence/evidence-bundle@1",
    exportedAt: new Date().toISOString(),
    dataset: d.meta,
    limitations: LIMITATIONS,
    initiatives: inis.map((i) => ({ ...i, metrics: initiativeMetrics(d, i) })),
    milestones: d.milestones.filter((m) => set.has(m.initiativeId)),
    pledges: d.pledges.filter((p) => set.has(p.initiativeId)),
    claims,
    evidence: d.evidence.filter((e) => evIds.has(e.id)),
    relationships: d.relationships.filter((r) => set.has(r.from.id) || set.has(r.to.id)),
  };
}

// ───────────────────────────── Vote manifest ─────────────────────────────

/**
 * The official vote manifest as published, for the API and MCP. Affiliation groups are returned
 * per initiative only when the slug/project alignment was confirmed on the last sync.
 */
export function voteManifest(d: Dataset) {
  const v = d.vote;
  const bySlug = new Map(d.initiatives.map((i) => [i.slug, i]));
  return {
    status: v.status,
    statusReason: v.statusReason,
    features: voteFeatureState(v),
    source: v.sourceUrl,
    fetchedAt: v.fetchedAt,
    stale: v.stale,
    round: { kind: v.kind, chainId: v.chainId, contract: v.contract, configRevision: v.configRevision, readAt: v.readAt, ballotRules: v.ballotRules, independentTiers: v.independentTiers },
    poolMicroUsd: v.poolMicroUsd,
    poolCents: v.poolCents,
    schedule: v.scheduleAvailable ? { opensAt: v.opensAt, closesAt: v.closesAt, ...v.schedule } : null,
    groups: v.groups,
    initiatives: v.groupsAvailable
      ? v.slugs.map((slug, i) => {
          const ini = bySlug.get(slug);
          return { index: i, slug, id: ini?.id ?? null, title: ini?.title ?? null, rfp: v.projects[i]?.rfp ?? null, groups: ini ? (v.initiativeGroups[ini.id] ?? []) : [] };
        })
      : [],
    alignment: v.alignment,
    note: v.groupsAvailable
      ? "Initiatives with an empty groups list are unaffiliated in the manifest. RFPs carry no affiliation."
      : "Per-initiative groups are withheld because the manifest is unavailable or its slug/project alignment was not confirmed.",
  };
}

// ───────────────────────────── Round 1 history ─────────────────────────────

export const ROUND1_SOURCE_LABEL = SOURCE_LABELS.independent;

/** Round 1 records attached to one initiative or organization, with round-level facts. */
function round1View(d: Dataset, matches: readonly Round1Match[]) {
  const r = d.round1;
  const byId = new Map(r.projects.map((p) => [p.id, p]));
  const stale = r.sources.filter((s) => s.stale).map((s) => ({ key: s.key, url: s.url, retrievedAt: s.retrievedAt, error: s.error }));
  return {
    status: r.status,
    sourceLabel: ROUND1_SOURCE_LABEL,
    checkedAt: r.checkedAt,
    stale,
    round: r.round,
    transparencyUrl: r.transparencyUrl,
    forumUrl: r.forumUrl,
    emptyText: ROUND1_EMPTY_TEXT,
    possibleText: ROUND1_POSSIBLE_TEXT,
    /** Donor counts are not published per project in any source checked, so none are shown. */
    donorCounts: null,
    records: matches.flatMap((m) => {
      const project = byId.get(m.projectId);
      return project ? [{ ...m, project }] : [];
    }),
    limitations: r.limitations,
  };
}
export type Round1View = ReturnType<typeof round1View>;

export function round1History(d: Dataset, idOrSlug: string): Round1View | null {
  const ini = findInitiative(d, idOrSlug);
  return ini ? round1View(d, d.round1.initiativeMatches[ini.id] ?? []) : null;
}

export function round1ForOrganization(d: Dataset, orgId: string): Round1View | null {
  const o = d.organizations.find((x) => x.id === orgId);
  return o ? round1View(d, d.round1.organizationMatches[o.id] ?? []) : null;
}

export function round1Sources(d: Dataset): string[] {
  return [d.round1.transparencyUrl, d.round1.forumUrl];
}

// ───────────────────────────── Evidence card ─────────────────────────────

/** Evidence card for one initiative: six sections, every item with a source label, URL and checked-on date. */
export function evidenceCard(d: Dataset, idOrSlug: string): EvidenceCard | null {
  const ini = findInitiative(d, idOrSlug);
  return ini ? buildEvidenceCard(d, ini, { fundingIdentity: FUNDING_IDENTITY }) : null;
}

const cardRowCache = new WeakMap<Dataset, Record<string, EvidenceCardRow>>();
/** Compact evidence-card summaries for the Research list, keyed by initiative id. */
export function evidenceCardRows(d: Dataset): Record<string, EvidenceCardRow> {
  const hit = cardRowCache.get(d);
  if (hit) return hit;
  const out = Object.fromEntries(d.initiatives.map((i) => [i.id, evidenceCardRow(buildEvidenceCard(d, i, { fundingIdentity: FUNDING_IDENTITY }))]));
  cardRowCache.set(d, out);
  return out;
}

// ───────────────────────────── Similar initiatives ─────────────────────────────

const similarCache = new WeakMap<Dataset, SimilarPair[]>();
/** Every visible similar-initiative pair in the cohort (method similar@1), ordered by title. Computed on request, never stored. */
export function similarPairsOf(d: Dataset): SimilarPair[] {
  const hit = similarCache.get(d);
  if (hit) return hit;
  const out = similarPairs({ initiatives: d.initiatives, pledges: d.pledges, organizations: d.organizations, groups: d.vote.groupsAvailable ? d.vote.initiativeGroups : null });
  similarCache.set(d, out);
  return out;
}

export interface SimilarItem {
  other: { id: string; slug: string; title: string; shortTitle: string; name: string; type: Initiative["type"] };
  label: SimilarLabel;
  signals: SimilarSignal[];
  notice: string;
  /** Opens the comparison with both initiatives selected. */
  compareHref: string;
}

/** Similar initiatives for one initiative, alphabetical by the other initiative's title. Null when the initiative is unknown. */
export function similarFor(d: Dataset, idOrSlug: string): SimilarItem[] | null {
  const ini = findInitiative(d, idOrSlug);
  if (!ini) return null;
  const byId = new Map(d.initiatives.map((i) => [i.id, i]));
  const out: SimilarItem[] = [];
  for (const p of similarPairsOf(d)) {
    if (p.a !== ini.id && p.b !== ini.id) continue;
    const o = byId.get(p.a === ini.id ? p.b : p.a);
    if (!o) continue;
    // The first quote of each signal is always from this initiative.
    const signals = p.a === ini.id ? p.signals : p.signals.map((s): SimilarSignal => (s.quotes ? { ...s, quotes: [s.quotes[1], s.quotes[0]] } : s));
    out.push({
      other: { id: o.id, slug: o.slug, title: o.title, shortTitle: o.shortTitle, name: displayName(d, o), type: o.type },
      label: p.label,
      signals,
      notice: p.notice,
      compareHref: `/initiatives?ids=${ini.slug},${o.slug}#compare`,
    });
  }
  return out.sort((x, y) => x.other.title.localeCompare(y.other.title, "en") || (x.other.id < y.other.id ? -1 : 1));
}

/** Initiative id → labels of its visible pairs, for the Research "Possible overlaps" filter. */
export function similarLabelsById(d: Dataset): Map<string, Set<SimilarLabel>> {
  const out = new Map<string, Set<SimilarLabel>>();
  for (const p of similarPairsOf(d)) for (const id of [p.a, p.b]) out.set(id, new Set([...(out.get(id) ?? []), p.label]));
  return out;
}

// ───────────────────────────── Open questions ─────────────────────────────

const lexiconCache = new WeakMap<Dataset, string[]>();
function partyLexicon(d: Dataset): string[] {
  const hit = lexiconCache.get(d);
  if (hit) return hit;
  const out = cohortPartyLexicon(d.milestones, d.organizations);
  lexiconCache.set(d, out);
  return out;
}

function openQuestionsOf(d: Dataset, ini: Initiative): OpenQuestion[] {
  return openQuestions({
    initiative: ini,
    organization: d.organizations.find((o) => o.id === ini.organizationId) ?? null,
    milestones: d.milestones.filter((m) => m.initiativeId === ini.id).sort((a, b) => a.index - b.index),
    pledges: d.pledges.filter((p) => p.initiativeId === ini.id),
    claims: d.claims.filter((c) => c.initiativeId === ini.id),
    lexicon: partyLexicon(d),
  });
}

/** Rule-based open questions for one initiative (open-questions@1), ordered by category and rule. Null when the initiative is unknown. */
export function openQuestionsFor(d: Dataset, idOrSlug: string): OpenQuestion[] | null {
  const ini = findInitiative(d, idOrSlug);
  return ini ? openQuestionsOf(d, ini) : null;
}

export interface OpenQuestionRow {
  id: string;
  slug: string;
  title: string;
  type: Initiative["type"];
  counts: CategoryCounts;
  total: number;
}

const oqRowsCache = new WeakMap<Dataset, OpenQuestionRow[]>();
/** Open-question counts per category for every initiative, in alphabetical order of titles. */
export function openQuestionRows(d: Dataset): OpenQuestionRow[] {
  const hit = oqRowsCache.get(d);
  if (hit) return hit;
  const out = [...d.initiatives]
    .sort((a, b) => a.title.localeCompare(b.title, "en") || (a.id < b.id ? -1 : 1))
    .map((ini) => {
      const qs = openQuestionsOf(d, ini);
      return { id: ini.id, slug: ini.slug, title: ini.title, type: ini.type, counts: countByCategory(qs), total: qs.length };
    });
  oqRowsCache.set(d, out);
  return out;
}

export function metricsFor(d: Dataset, idOrSlug?: string): Record<string, MetricValue> | null {
  if (!idOrSlug) return cohortMetrics(d);
  const i = findInitiative(d, idOrSlug);
  return i ? initiativeMetrics(d, i) : null;
}

// ───────────────────────────── Research coverage (Item 14) ─────────────────────────────

/** Automated research tasks whose results the research-dependent dossier sections read. */
export const COVERAGE_TASKS = ["websites", "github", "milestone_artifacts", "donations_onchain"] as const;
export const COVERAGE_TASK_LABEL: Record<(typeof COVERAGE_TASKS)[number], string> = {
  websites: "Website and product page checks",
  github: "GitHub repository checks",
  milestone_artifacts: "Milestone artifact checks",
  donations_onchain: "Onchain donation checks",
};

export interface ResearchCoverage {
  initiativeId: string;
  /** Automated research tasks that finished successfully, in COVERAGE_TASKS order. */
  succeededTasks: string[];
  /** Plain-language names of the tasks that have not finished successfully. */
  missing: string[];
  /** Evidence records cited by this initiative's statements. */
  evidenceRecords: number;
  /** Statements with origin "ai". The site runs no AI model, so this is 0 unless a curated AI record is published. */
  aiStatements: number;
  /** True when at least one automated research task succeeded. Sections that depend on research show "Not yet researched" otherwise. */
  researched: boolean;
  /** True when an AI research result is published for this initiative. */
  aiResearched: boolean;
}

/** Whether an initiative has a research dossier: automated research results and AI research. Null when unknown. */
export function researchCoverage(d: Dataset, idOrSlug: string): ResearchCoverage | null {
  const ini = findInitiative(d, idOrSlug);
  if (!ini) return null;
  const jobs = d.researchJobs.filter((j) => j.initiativeId === ini.id);
  const ok = COVERAGE_TASKS.filter((t) => jobs.some((j) => j.task === t && j.state === "succeeded"));
  const claims = d.claims.filter((c) => c.initiativeId === ini.id);
  const ev = new Set(claims.flatMap((c) => c.evidenceIds));
  const ai = claims.filter((c) => c.origin === "ai").length;
  return {
    initiativeId: ini.id,
    succeededTasks: [...ok],
    missing: COVERAGE_TASKS.filter((t) => !ok.includes(t)).map((t) => COVERAGE_TASK_LABEL[t]),
    evidenceRecords: d.evidence.filter((e) => ev.has(e.id)).length,
    aiStatements: ai,
    researched: ok.length > 0,
    aiResearched: ai > 0,
  };
}

export interface SourceLink {
  label: string;
  url: string;
}

/**
 * Where a rule-based counterargument (blind spot) comes from: the cited sources of the statement,
 * the milestone link or the official milestone record, the other initiative in an overlap, or the
 * official proposal when the rule searched the proposal text. Every blind spot gets at least one.
 */
export function blindSpotSources(d: Dataset, b: BlindSpot): SourceLink[] {
  const ini = findInitiative(d, b.initiativeId);
  const official: SourceLink = { label: "Official proposal", url: ini?.url ?? "" };
  const out: SourceLink[] = [];
  for (const ref of b.refs) {
    const c = d.claims.find((x) => x.id === ref);
    if (c) {
      const heading = ini?.sections.find((s) => s.key === c.section)?.heading;
      for (const u of c.sourceUrls) if (/^https?:\/\//.test(u)) out.push({ label: u === ini?.url ? (heading ? `Official proposal: ${heading}` : "Official proposal") : u.replace(/^https?:\/\/(www\.)?/, "").slice(0, 80), url: u });
      continue;
    }
    const m = d.milestones.find((x) => x.id === ref);
    if (m) {
      out.push(m.link && /^https?:\/\//.test(m.link) ? { label: `Milestone ${m.index + 1} link`, url: m.link } : { label: `Milestone ${m.index + 1} in the official record`, url: official.url });
      continue;
    }
    const o = d.initiatives.find((x) => x.id === ref);
    if (o) out.push({ label: o.shortTitle, url: o.url });
  }
  if (out.length === 0 && official.url) out.push(official);
  const seen = new Set<string>();
  return out.filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true)));
}

// ───────────────────────────── 10-minute briefing ─────────────────────────────

export { BRIEFING_MINUTES, BRIEFING_NOTE, OPTIONAL_RULE, READING_TIME_RULE, WORDS_PER_MINUTE, chainOrder, chainTotalMinutes, classifyLink, focusInitiativeIds, type Briefing, type BriefingItem } from "./briefing";

/** Ordered, timed reading list for one initiative, built only from the official proposal and the Round 1 and Evidence card data when they exist. */
export function briefingFor(d: Dataset, idOrSlug: string): Briefing | null {
  const ini = findInitiative(d, idOrSlug);
  if (!ini) return null;
  const r1 = round1History(d, ini.id);
  const card = evidenceCard(d, ini.id);
  return buildBriefing({
    initiative: { id: ini.id, slug: ini.slug, title: ini.title, url: ini.url, summary: ini.summary, sections: ini.sections, links: ini.links, textLinks: ini.textLinks },
    milestones: d.milestones.filter((m) => m.initiativeId === ini.id).map((m) => ({ index: m.index, name: m.name, criteria: m.criteria, link: m.link })),
    round1: (r1?.records ?? []).map((r) => ({ name: r.round1ProjectName, status: r.status, totalEth: r.project.totalEth ?? null, progressUpdateUrl: r.project.progressUpdateUrl ?? null, transparencyUrl: r.transparencyUrl })),
    card: (card?.sections ?? []).map((s) => ({ title: s.title, items: s.items.map((i) => ({ label: i.label, value: i.value, link: i.link, sourceName: i.sourceName, sourceLabel: i.sourceLabel, sourceUrl: i.sourceUrl, checkedAt: i.checkedAt })) })),
    possibleText: ROUND1_POSSIBLE_TEXT,
  });
}
