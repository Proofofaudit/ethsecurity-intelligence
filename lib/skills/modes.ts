import type { LabConfig, Perspective } from "./schema";

export interface ResearchMode {
  id: Perspective;
  label: string;
  /** One line for the mode picker. */
  summary: string;
  /** How the assistant should read the material from this perspective. */
  stance: string;
  defaults: Omit<LabConfig, "version" | "name" | "perspective" | "weights">;
}

const baseEvidence: LabConfig["evidence"] = { establishedAt: "partially_supported", applicantStatements: "quote_and_label", citeClaimIds: true, sources: "dataset_and_cited" };
const baseFunding: LabConfig["funding"] = { goalMinUsd: null, goalMaxUsd: null, fundedMinPct: null, fundedMaxPct: null, pledgeConversionPct: 100, excludeAdoptionMilestones: false, budgetUsd: null };
const all = { categories: [], stages: [], initiatives: [], organizations: [], initiativeTypes: ["grant", "rfp"] as LabConfig["initiativeTypes"] };

/** Prebuilt research modes. None of them sets weights: weighting is always the reviewer's own choice. */
export const MODES: ResearchMode[] = [
  {
    id: "smart-contract-auditor",
    label: "Smart contract auditor",
    summary: "Analysis tools, audits, fuzzing and verification: what can be inspected in code today.",
    stance: "Read as a smart contract auditor. Separate tools and services that can be used and inspected today from planned work, and check whether cited repositories contain what the milestones describe.",
    defaults: {
      ...all,
      categories: ["audits-analysis", "formal-verification", "fuzzing-testing", "compilers"],
      stages: ["development", "testing", "deployment"],
      focusQuestions: [
        "What does each tool or service analyze today, and which parts are only planned?",
        "Which cited repositories can be inspected, and do they contain the components the milestones describe?",
        "Which acceptance criteria could an independent reviewer check without the team's help?",
        "What would auditors use the deliverables for, and what existing tools would they replace or complement?",
      ],
      researchMinutes: 120,
      depth: "code_level",
      metrics: ["initiative.evidence_coverage", "initiative.repos_public", "initiative.repos_active_90d", "initiative.repos_with_ci", "initiative.largest_milestone_share", "initiative.open_questions"],
      evidence: baseEvidence,
      funding: baseFunding,
      results: 10,
      outputFormat: "memo",
      counterarguments: "per_finding",
      uncertainty: "inline",
      allowInference: false,
    },
  },
  {
    id: "wallet-engineer",
    label: "Wallet engineer",
    summary: "Signing, transaction construction and wallet integrations, and what depends on wallet adoption.",
    stance: "Read as a wallet engineer. Focus on what a signer would see and do, which wallet integrations are confirmed by a public source, and which standards and third parties the work depends on.",
    defaults: {
      ...all,
      categories: ["wallets-signing", "opsec"],
      stages: ["transaction_construction", "signing"],
      focusQuestions: [
        "Which wallet or signer integrations are stated, and which are confirmed by a public source?",
        "Which standards (for example ERC-7730) does each initiative depend on, and what happens if they change?",
        "What can a signer use today, and what is planned?",
        "Which milestones depend on third-party wallet adoption, and what share of the goal do they carry?",
      ],
      researchMinutes: 90,
      depth: "deep",
      metrics: ["initiative.evidence_coverage", "initiative.adoption_share", "initiative.repos_public", "initiative.repos_active_90d", "initiative.open_questions"],
      evidence: baseEvidence,
      funding: baseFunding,
      results: 10,
      outputFormat: "memo",
      counterarguments: "per_initiative",
      uncertainty: "inline",
      allowInference: false,
    },
  },
  {
    id: "infrastructure-engineer",
    label: "Infrastructure engineer",
    summary: "Clients, nodes, monitoring and operational security, including who runs things after funding.",
    stance: "Read as an infrastructure engineer. Focus on what runs where, operational commitments such as hosting and maintenance, and external dependencies that could block delivery.",
    defaults: {
      ...all,
      categories: ["infrastructure", "opsec", "detection-response"],
      stages: ["runtime_execution", "monitoring", "infra_opsec"],
      focusQuestions: [
        "Which clients, nodes or services do the deliverables run on or change?",
        "What operational commitments (hosting, availability, maintenance) are described, and who pays for them after funding ends?",
        "Which external dependencies could block delivery?",
      ],
      researchMinutes: 90,
      depth: "deep",
      metrics: ["initiative.repos_public", "initiative.repos_active_90d", "initiative.repos_with_ci", "initiative.adoption_share", "initiative.largest_milestone_share"],
      evidence: baseEvidence,
      funding: baseFunding,
      results: 10,
      outputFormat: "memo",
      counterarguments: "per_initiative",
      uncertainty: "inline",
      allowInference: false,
    },
  },
  {
    id: "security-researcher",
    label: "Security researcher",
    summary: "Which security problems the cohort addresses, where claims rest on the applicant alone, and overlaps.",
    stance: "Read as a security researcher. Map each initiative to the security problem it addresses, test its claims against the evidence, and look for overlaps and gaps across the cohort.",
    defaults: {
      ...all,
      focusQuestions: [
        "Which security problem does each initiative address, and which lifecycle stages have few initiatives in this cohort?",
        "Which material claims rest only on the applicant's statements?",
        "Where do initiatives possibly overlap or complement each other, and what would tell the two apart?",
      ],
      researchMinutes: 120,
      depth: "deep",
      metrics: ["initiative.evidence_coverage", "initiative.open_questions", "initiative.repos_public"],
      evidence: baseEvidence,
      funding: baseFunding,
      results: 15,
      outputFormat: "memo",
      counterarguments: "dedicated_section",
      uncertainty: "both",
      allowInference: true,
    },
  },
  {
    id: "grant-evaluator",
    label: "Grant evaluator",
    summary: "Milestones, acceptance criteria, existing work and what happens after funding ends.",
    stance: "Read as a grant evaluator. Check whether milestones are specific and checkable, what exists today with proof, what the funding would build, and what happens after funding ends.",
    defaults: {
      ...all,
      focusQuestions: [
        "Are the milestones specific, with acceptance criteria a reviewer can check?",
        "What exists today with proof, and what would the funding build?",
        "What happens to the deliverables after funding ends?",
        "Which questions would you ask the team before deciding?",
      ],
      researchMinutes: 60,
      depth: "standard",
      metrics: ["initiative.pct_funded", "initiative.remaining", "initiative.milestones", "initiative.largest_milestone_share", "initiative.adoption_share", "initiative.open_questions", "initiative.evidence_coverage"],
      evidence: baseEvidence,
      funding: baseFunding,
      results: 10,
      outputFormat: "checklist",
      counterarguments: "per_initiative",
      uncertainty: "inline",
      allowInference: false,
    },
  },
  {
    id: "funding-analyst",
    label: "Funding analyst",
    summary: "Donations versus pledges, backer concentration, self-pledges and funding gaps under your assumptions.",
    stance: "Read as a funding analyst. Keep received donations, outstanding pledges and remaining requirements apart, and describe backer concentration without judging it.",
    defaults: {
      ...all,
      focusQuestions: [
        "How much of each goal is held as donations, and how much is outstanding pledges?",
        "How concentrated is backing, and which backers support several initiatives?",
        "Which pledges are self-pledges by the recipient organization?",
        "How do the gaps change at the pledge conversion rate set in this brief?",
      ],
      researchMinutes: 45,
      depth: "overview",
      metrics: ["initiative.pct_funded", "initiative.remaining", "initiative.donated_share", "initiative.backers", "initiative.top_backer_share", "initiative.backer_hhi", "initiative.self_pledged", "initiative.adoption_share"],
      evidence: { ...baseEvidence, sources: "dataset_only" },
      funding: baseFunding,
      results: 20,
      outputFormat: "table",
      counterarguments: "per_initiative",
      uncertainty: "section",
      allowInference: false,
    },
  },
  {
    id: "ecosystem-researcher",
    label: "Ecosystem researcher",
    summary: "Coverage across lifecycle stages and categories, complements and shared dependencies.",
    stance: "Read as an ecosystem researcher. Describe how the cohort covers the security lifecycle, which initiatives might complement each other, and which standards or repositories connect them.",
    defaults: {
      ...all,
      focusQuestions: [
        "Which lifecycle stages and official categories does the cohort cover, and where is coverage thin within this cohort?",
        "Which initiatives might complement each other, and what evidence supports the hypothesis?",
        "Which shared dependencies (standards, repositories) connect initiatives?",
      ],
      researchMinutes: 60,
      depth: "overview",
      metrics: ["initiative.adoption_share", "initiative.evidence_coverage", "initiative.repos_public"],
      evidence: baseEvidence,
      funding: baseFunding,
      results: 20,
      outputFormat: "memo",
      counterarguments: "per_initiative",
      uncertainty: "section",
      allowInference: true,
    },
  },
  {
    id: "adversarial-reviewer",
    label: "Independent adversarial reviewer",
    summary: "The strongest case against each stated capability, figure and milestone, including this research.",
    stance: "Act as an independent adversarial reviewer. For every stated capability, figure and milestone, build the strongest evidence-based case that it is weaker than presented, and say where this research itself could be wrong.",
    defaults: {
      ...all,
      focusQuestions: [
        "What is the strongest evidence-based case that each stated capability does not exist yet?",
        "Which figures and integrations lack independent support?",
        "Which milestones could be marked done without delivering the stated value?",
        "Where could this dataset be incomplete or wrong, including for the Proof of Audits initiative?",
      ],
      researchMinutes: 120,
      depth: "deep",
      metrics: ["initiative.evidence_coverage", "initiative.open_questions", "initiative.adoption_share", "initiative.top_backer_share", "initiative.self_pledged"],
      evidence: { ...baseEvidence, establishedAt: "independently_verified" },
      funding: baseFunding,
      results: 10,
      outputFormat: "memo",
      counterarguments: "dedicated_section",
      uncertainty: "both",
      allowInference: false,
    },
  },
];

export const MODE_BY_ID = new Map(MODES.map((m) => [m.id, m]));

export function modeConfig(id: Perspective): LabConfig {
  const m = MODE_BY_ID.get(id);
  if (!m) throw new Error(`Unknown research mode ${id}`);
  const d = structuredClone(m.defaults);
  return { version: 1, name: m.label, perspective: m.id, weights: {}, ...d };
}
