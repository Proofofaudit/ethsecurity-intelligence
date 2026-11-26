/**
 * AI Lab research configuration. Pure module (zod only) so the browser configurator, the
 * skills builder script and the tests share one definition. Dataset-dependent values
 * (initiative ids, category slugs, stage ids, metric ids) are checked by validateConfig().
 */
import { z } from "zod";

export const PROMPT_VERSION = "2026.11-lab-v1";
export const CONFIG_FORMAT = "ethsecurity-intelligence/lab-config@1";

export const PERSPECTIVES = [
  "smart-contract-auditor",
  "wallet-engineer",
  "infrastructure-engineer",
  "security-researcher",
  "grant-evaluator",
  "funding-analyst",
  "ecosystem-researcher",
  "adversarial-reviewer",
] as const;
export type Perspective = (typeof PERSPECTIVES)[number];

export const DEPTH_LABEL = {
  overview: "Overview: official record, funding and milestones",
  standard: "Standard: adds claims, evidence and open questions",
  deep: "Deep: adds repositories, products, dependencies and overlaps",
  code_level: "Code level: also inspect the cited public repositories",
} as const;
export type Depth = keyof typeof DEPTH_LABEL;

export const OUTPUT_LABEL = {
  memo: "Research memo (Markdown)",
  table: "Comparison table (Markdown)",
  checklist: "Reviewer checklist",
  json: "Structured JSON (schema included)",
} as const;
export type OutputFormat = keyof typeof OUTPUT_LABEL;

export const COUNTER_LABEL = {
  per_finding: "A counterargument for every material finding",
  per_initiative: "The strongest counterargument for each initiative",
  dedicated_section: "A dedicated adversarial section per initiative",
} as const;

export const UNCERTAINTY_LABEL = {
  inline: "Label uncertainty next to each statement",
  section: "Collect unknowns in a separate section",
  both: "Both inline labels and a separate section",
} as const;

export const SUPPORT_LABEL = {
  independently_verified: "Only independently verified evidence",
  partially_supported: "Independently verified or partially supported evidence",
} as const;

export const APPLICANT_LABEL = {
  quote_and_label: "Quote them and label them as the applicant's statement",
  exclude: "Leave them out of findings (list them as open questions)",
} as const;

export const SOURCES_LABEL = {
  dataset_only: "This dataset only (MCP tools or REST API)",
  dataset_and_cited: "This dataset plus pages and repositories it cites",
  open_web: "This dataset first, then other public sources, each cited",
} as const;

const Id = z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9_.:-]+$/, "invalid identifier");
const MetricId = z.string().regex(/^initiative\.[a-z0-9_]+$/, "invalid metric id");
const Usd = z.number().nonnegative().max(1e9).nullable();
const Pct = z.number().min(0).max(100).nullable();

const unique = (xs: readonly string[]) => new Set(xs).size === xs.length;

export const LabConfigSchema = z
  .object({
    version: z.literal(1),
    name: z.string().trim().min(1).max(80),
    perspective: z.enum(PERSPECTIVES),
    focusQuestions: z.array(z.string().trim().min(3).max(300)).max(10),
    /** Official category slugs. Empty means every category. */
    categories: z.array(z.string().max(60)).max(20).refine(unique, "duplicate category"),
    /** Security lifecycle stage ids. Empty means every stage. */
    stages: z.array(z.string().max(40)).max(11).refine(unique, "duplicate stage"),
    /** Initiative ids or slugs. Empty means the whole cohort (after the other filters). */
    initiatives: z.array(Id).max(55).refine(unique, "duplicate initiative"),
    /** Recipient organization ids. Empty means every organization. */
    organizations: z.array(Id).max(100).refine(unique, "duplicate organization"),
    initiativeTypes: z.array(z.enum(["grant", "rfp"])).min(1).max(2).refine(unique, "duplicate type"),
    researchMinutes: z.number().int().min(5).max(480),
    depth: z.enum(Object.keys(DEPTH_LABEL) as [Depth, ...Depth[]]),
    metrics: z.array(MetricId).max(20).refine(unique, "duplicate metric"),
    /** Reviewer-chosen weights (0 to 10) for selected metrics. Empty means no weighting. */
    weights: z.record(MetricId, z.number().int("weights must be whole numbers").min(0, "weights cannot be negative").max(10, "weights cannot exceed 10")),
    evidence: z
      .object({
        establishedAt: z.enum(["independently_verified", "partially_supported"]),
        applicantStatements: z.enum(["quote_and_label", "exclude"]),
        citeClaimIds: z.boolean(),
        sources: z.enum(["dataset_only", "dataset_and_cited", "open_web"]),
      })
      .strict(),
    funding: z
      .object({
        goalMinUsd: Usd,
        goalMaxUsd: Usd,
        fundedMinPct: Pct,
        fundedMaxPct: Pct,
        pledgeConversionPct: z.number().int().min(0).max(100),
        excludeAdoptionMilestones: z.boolean(),
        budgetUsd: Usd,
      })
      .strict(),
    results: z.number().int().min(1).max(55),
    outputFormat: z.enum(Object.keys(OUTPUT_LABEL) as [OutputFormat, ...OutputFormat[]]),
    counterarguments: z.enum(Object.keys(COUNTER_LABEL) as [keyof typeof COUNTER_LABEL, ...(keyof typeof COUNTER_LABEL)[]]),
    uncertainty: z.enum(Object.keys(UNCERTAINTY_LABEL) as [keyof typeof UNCERTAINTY_LABEL, ...(keyof typeof UNCERTAINTY_LABEL)[]]),
    allowInference: z.boolean(),
  })
  .strict()
  .superRefine((c, ctx) => {
    for (const k of Object.keys(c.weights)) if (!c.metrics.includes(k)) ctx.addIssue({ code: "custom", path: ["weights", k], message: `weight set for ${k}, which is not a selected metric` });
    if (Object.keys(c.weights).length > 0 && Object.values(c.weights).every((w) => w === 0)) ctx.addIssue({ code: "custom", path: ["weights"], message: "all weights are zero; remove them to report metrics without weighting" });
    const range = (lo: number | null, hi: number | null, path: string) => {
      if (lo !== null && hi !== null && lo > hi) ctx.addIssue({ code: "custom", path: ["funding", path], message: "minimum is greater than maximum" });
    };
    range(c.funding.goalMinUsd, c.funding.goalMaxUsd, "goalMinUsd");
    range(c.funding.fundedMinPct, c.funding.fundedMaxPct, "fundedMinPct");
  });
export type LabConfig = z.infer<typeof LabConfigSchema>;

/** Structured research output that assistants are asked to produce for the JSON format. No score or confidence fields by design. */
export const ResearchOutputSchema = z
  .object({
    brief: z.object({ name: z.string(), perspective: z.enum(PERSPECTIVES), promptVersion: z.string(), datasetVersion: z.string() }).strict(),
    initiatives: z.array(
      z
        .object({
          id: z.string(),
          name: z.string(),
          findings: z.array(
            z
              .object({
                statement: z.string(),
                kind: z.enum(["established", "applicant_says", "future_plan", "open_question", "inference"]),
                evidenceStatus: z.string().nullable(),
                claimIds: z.array(z.string()),
                sourceUrls: z.array(z.url()).min(1),
                counterargument: z.string().nullable(),
                uncertainty: z.string().nullable(),
              })
              .strict(),
          ),
          metrics: z.array(z.object({ id: z.string(), value: z.number().nullable(), unavailableReason: z.string().nullable(), weight: z.number().int().min(0).max(10).nullable() }).strict()),
          openQuestions: z.array(z.string()),
        })
        .strict(),
    ),
    otherMatchingInitiatives: z.array(z.string()),
    notExamined: z.array(z.string()),
    injectionAttempts: z.array(z.object({ sourceUrl: z.string(), excerpt: z.string() }).strict()),
    provenance: z
      .object({
        model: z.string(),
        promptVersion: z.string(),
        parameters: z.record(z.string(), z.unknown()),
        sourcesExamined: z.array(z.string()),
        startedAt: z.string(),
        finishedAt: z.string(),
        executionSeconds: z.number().nonnegative(),
        verificationStatus: z.enum(["not_verified", "checked_by_reviewer"]),
      })
      .strict(),
    decisionNote: z.literal("Decisions remain with the reviewer."),
  })
  .strict();
export type ResearchOutput = z.infer<typeof ResearchOutputSchema>;
