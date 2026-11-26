/**
 * Canonical data contracts for ETHSecurity Intelligence.
 *
 * Every record separates its *origin*:
 *  - "official"   : copied from TheDAO Security Fund API (authoritative, never overwritten by research)
 *  - "external"   : observed by the research pipeline from a third-party public source
 *  - "applicant"  : stated by the applicant in proposal text
 *  - "derived"    : computed deterministically from the above
 *  - "ai"         : an AI-generated interpretation (never treated as verified fact)
 *  - "curated"    : recorded by a human or agent researcher with cited sources
 * All money is integer US cents.
 */
import { z } from "zod";

export const Origin = z.enum(["official", "external", "applicant", "derived", "ai", "curated"]);
export type Origin = z.infer<typeof Origin>;

export const EvidenceStatus = z.enum([
  "independently_verified",
  "officially_reported",
  "applicant_reported",
  "partially_supported",
  "not_independently_verified",
  "contradicted",
  "disputed",
  "future_target",
  "outdated",
  "not_applicable",
]);
export type EvidenceStatus = z.infer<typeof EvidenceStatus>;

export const EVIDENCE_STATUS_LABEL: Record<EvidenceStatus, string> = {
  independently_verified: "Independently verified",
  officially_reported: "Officially reported",
  applicant_reported: "Applicant-reported",
  partially_supported: "Partially supported",
  not_independently_verified: "Not independently verified",
  contradicted: "Contradicted by evidence",
  disputed: "Disputed",
  future_target: "Future target",
  outdated: "Outdated",
  not_applicable: "Not applicable",
};

export const Provenance = z.object({
  origin: Origin,
  sourceUrls: z.array(z.string()),
  retrievedAt: z.string(),
  method: z.string(),
  /** Pipeline or methodology version that produced the record. */
  version: z.string(),
});
export type Provenance = z.infer<typeof Provenance>;

export const LifecycleStage = z.enum([
  "development",
  "testing",
  "deployment",
  "transaction_construction",
  "signing",
  "runtime_execution",
  "monitoring",
  "threat_detection",
  "incident_response",
  "recovery",
  "infra_opsec",
]);
export type LifecycleStage = z.infer<typeof LifecycleStage>;

export const StageMapping = z.object({
  stage: LifecycleStage,
  /** Terms in the proposal text that triggered the mapping. */
  matchedTerms: z.array(z.string()),
  /** Number of term hits; used only to order stages, never as a score. */
  hits: z.number().int(),
  primary: z.boolean(),
});

export const InitiativeSection = z.object({ key: z.string(), heading: z.string(), markdown: z.string() });

export const Funding = z.object({
  goalCents: z.number().int(),
  /** Official "raised": pledged + received + donated as returned by the initiative endpoint. */
  officialRaisedCents: z.number().int(),
  pledgedCents: z.number().int(),
  receivedCents: z.number().int(),
  donatedCents: z.number().int(),
  paidOutCents: z.number().int(),
  /** Safe-balance ledger value reported by the API; may be cached. Null when not reported. */
  ledgerCents: z.number().int().nullable(),
  live: z.boolean().nullable(),
  officialPct: z.number().nullable(),
  remainingCents: z.number().int(),
  ledgerCheckedAt: z.string().nullable(),
});
export type Funding = z.infer<typeof Funding>;

export const Initiative = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  shortTitle: z.string(),
  type: z.enum(["grant", "rfp"]),
  url: z.string(),
  markdownUrl: z.string(),
  summary: z.string(),
  categories: z.array(z.object({ slug: z.string(), label: z.string() })),
  listStatus: z.string(),
  approvalStatus: z.string(),
  onBallot: z.boolean(),
  cohortMember: z.boolean(),
  eligibilityNote: z.string().nullable(),
  recipientTeam: z.string().nullable(),
  recipientUrl: z.string().nullable(),
  organizationId: z.string().nullable(),
  durationMonths: z.number().int().nullable(),
  topup: z.boolean(),
  milestoneReviewer: z.string().nullable(),
  discourseUrl: z.string().nullable(),
  safeAddress: z.string().nullable(),
  approvedAt: z.string().nullable(),
  createdAt: z.string().nullable(),
  revision: z.number().int().nullable(),
  structured: z.boolean(),
  sections: z.array(InitiativeSection),
  links: z.array(z.string()),
  /** Links found inside proposal text (official `links` is often empty). */
  textLinks: z.array(z.object({ url: z.string(), text: z.string().nullable(), section: z.string() })),
  funding: Funding,
  stages: z.array(StageMapping),
  standards: z.array(z.string()),
  commentCount: z.number().int().nullable(),
  contentHash: z.string(),
  provenance: Provenance,
});
export type Initiative = z.infer<typeof Initiative>;

export const Milestone = z.object({
  id: z.string(),
  initiativeId: z.string(),
  index: z.number().int(),
  name: z.string(),
  amountCents: z.number().int(),
  shareOfGoal: z.number().nullable(),
  adoption: z.boolean(),
  done: z.boolean(),
  targetMonth: z.string().nullable(),
  link: z.string().nullable(),
  criteria: z.array(z.string()),
  /** Deterministic flags raised for reviewer attention. Phrased as questions. */
  questions: z.array(z.object({ code: z.string(), question: z.string() })),
  dependencyTerms: z.array(z.string()),
  provenance: Provenance,
});
export type Milestone = z.infer<typeof Milestone>;

export const Pledge = z.object({
  id: z.string(),
  initiativeId: z.string(),
  backerId: z.string(),
  company: z.string(),
  amountCents: z.number().int(),
  status: z.enum(["pledged", "received"]),
  url: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: z.string().nullable(),
  provenance: Provenance,
});
export type Pledge = z.infer<typeof Pledge>;

export const Donation = z.object({
  id: z.string(),
  initiativeId: z.string(),
  txHash: z.string(),
  tokenSymbol: z.string(),
  amountUsdCents: z.number().int().nullable(),
  status: z.string(),
  confirmedAt: z.string().nullable(),
  explorerUrl: z.string(),
  provenance: Provenance,
});
export type Donation = z.infer<typeof Donation>;

export const Organization = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["recipient", "backer", "both", "related"]),
  /** Anonymous or individual labels are never merged across pledges. */
  anonymous: z.boolean(),
  /** All official name spellings seen for this entity. */
  names: z.array(z.string()),
  website: z.string().nullable(),
  initiativeIds: z.array(z.string()),
  backedInitiativeIds: z.array(z.string()),
  github: z.string().nullable(),
  description: z.string().nullable(),
  websiteCheck: z
    .object({
      url: z.string(),
      status: z.number().nullable(),
      finalUrl: z.string().nullable(),
      title: z.string().nullable(),
      description: z.string().nullable(),
      checkedAt: z.string(),
      ok: z.boolean(),
    })
    .nullable(),
  githubProfile: z
    .object({
      login: z.string(),
      type: z.string(),
      name: z.string().nullable(),
      blog: z.string().nullable(),
      createdAt: z.string().nullable(),
      publicRepos: z.number().int().nullable(),
      url: z.string(),
    })
    .nullable(),
  notes: z.array(z.object({ text: z.string(), sourceUrls: z.array(z.string()), status: EvidenceStatus, origin: Origin })),
  provenance: Provenance,
});
export type Organization = z.infer<typeof Organization>;

export const OrganizationAlias = z.object({
  id: z.string(),
  alias: z.string(),
  organizationId: z.string(),
  resolution: z.enum(["exact_normalized", "same_official_domain", "curated_with_evidence", "candidate_unconfirmed", "anonymous_not_merged"]),
  candidateOrganizationId: z.string().nullable(),
  reason: z.string(),
  sourceUrls: z.array(z.string()),
});
export type OrganizationAlias = z.infer<typeof OrganizationAlias>;

export const Person = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string().nullable(),
  initiativeIds: z.array(z.string()),
  organizationId: z.string().nullable(),
  publicProfiles: z.array(z.string()),
  mentionedIn: z.array(z.string()),
  provenance: Provenance,
});
export type Person = z.infer<typeof Person>;

export const Repository = z.object({
  id: z.string(),
  fullName: z.string(),
  url: z.string(),
  initiativeIds: z.array(z.string()),
  exists: z.boolean(),
  checkedAt: z.string(),
  description: z.string().nullable(),
  license: z.string().nullable(),
  archived: z.boolean().nullable(),
  fork: z.boolean().nullable(),
  defaultBranch: z.string().nullable(),
  createdAt: z.string().nullable(),
  pushedAt: z.string().nullable(),
  stars: z.number().int().nullable(),
  openIssues: z.number().int().nullable(),
  language: z.string().nullable(),
  topics: z.array(z.string()),
  latestRelease: z.object({ tag: z.string(), publishedAt: z.string().nullable(), url: z.string() }).nullable(),
  releaseCount: z.number().int().nullable(),
  hasCiWorkflows: z.boolean().nullable(),
  hasTestsDir: z.boolean().nullable(),
  hasSecurityPolicy: z.boolean().nullable(),
  hasReadme: z.boolean().nullable(),
  commitsLast90d: z.number().int().nullable(),
  contributorsSampled: z.number().int().nullable(),
  error: z.string().nullable(),
  provenance: Provenance,
});
export type Repository = z.infer<typeof Repository>;

export const Product = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  initiativeIds: z.array(z.string()),
  kind: z.enum(["website", "app", "docs", "dashboard", "package", "paper", "dataset", "other"]),
  reachable: z.boolean().nullable(),
  status: z.number().nullable(),
  title: z.string().nullable(),
  checkedAt: z.string().nullable(),
  provenance: Provenance,
});
export type Product = z.infer<typeof Product>;

export const Integration = z.object({
  id: z.string(),
  initiativeId: z.string(),
  counterparty: z.string(),
  statement: z.string(),
  section: z.string(),
  kind: z.enum(["existing", "planned", "adoption_target"]),
  status: EvidenceStatus,
  sourceUrls: z.array(z.string()),
  provenance: Provenance,
});
export type Integration = z.infer<typeof Integration>;

export const PreviousGrant = z.object({
  id: z.string(),
  initiativeId: z.string(),
  funder: z.string(),
  statement: z.string(),
  amountCents: z.number().int().nullable(),
  status: EvidenceStatus,
  sourceUrls: z.array(z.string()),
  provenance: Provenance,
});
export type PreviousGrant = z.infer<typeof PreviousGrant>;

export const SecurityProblem = z.object({
  id: LifecycleStage,
  label: z.string(),
  description: z.string(),
  terms: z.array(z.string()),
  officialCategoryHints: z.array(z.string()),
});
export type SecurityProblem = z.infer<typeof SecurityProblem>;

export const ClaimKind = z.enum([
  "milestone_deliverable",
  "milestone_completed",
  "existing_artifact",
  "quantitative",
  "integration",
  "previous_funding",
  "funding_pledge",
  "funding_received",
  "donation",
  "team",
  "adoption_commitment",
  "curated_finding",
]);
export type ClaimKind = z.infer<typeof ClaimKind>;

export const ClaimHistoryEntry = z.object({
  at: z.string(),
  status: EvidenceStatus,
  assertion: z.string(),
  reason: z.string(),
  correctionId: z.string().nullable(),
});

export const Claim = z.object({
  id: z.string(),
  initiativeId: z.string(),
  kind: ClaimKind,
  assertion: z.string(),
  origin: Origin,
  section: z.string().nullable(),
  quote: z.string().nullable(),
  sourceUrls: z.array(z.string()),
  evidenceIds: z.array(z.string()),
  supportingEvidenceIds: z.array(z.string()),
  contradictingEvidenceIds: z.array(z.string()),
  status: EvidenceStatus,
  verificationMethod: z.string(),
  verifiedAt: z.string().nullable(),
  limitations: z.array(z.string()),
  material: z.boolean(),
  history: z.array(ClaimHistoryEntry),
});
export type Claim = z.infer<typeof Claim>;

export const Evidence = z.object({
  id: z.string(),
  kind: z.enum([
    "official_record",
    "http_check",
    "github_repository",
    "github_pull_request",
    "github_profile",
    "onchain_transaction",
    "proposal_text",
    "curated_source",
  ]),
  url: z.string(),
  title: z.string(),
  observedAt: z.string(),
  /** Short machine-observed facts; not prose interpretation. */
  facts: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  excerpt: z.string().nullable(),
  ok: z.boolean(),
  provenance: Provenance,
});
export type Evidence = z.infer<typeof Evidence>;

export const EntityType = z.enum([
  "initiative",
  "organization",
  "backer",
  "person",
  "repository",
  "technology",
  "standard",
  "product",
  "integration",
  "milestone",
  "problem",
]);
export type EntityType = z.infer<typeof EntityType>;

export const RelationType = z.enum([
  "funds",
  "develops",
  "maintains",
  "integrates",
  "depends_on",
  "addresses",
  "proposes",
  "references",
  "potentially_overlaps",
  "potentially_complements",
]);
export type RelationType = z.infer<typeof RelationType>;

export const Relationship = z.object({
  id: z.string(),
  from: z.object({ type: EntityType, id: z.string() }),
  to: z.object({ type: EntityType, id: z.string() }),
  type: RelationType,
  /** confirmed = backed by official/external evidence; stated = applicant text; inferred = derived heuristic. */
  confidence: z.enum(["confirmed", "stated", "inferred"]),
  reason: z.string(),
  evidenceIds: z.array(z.string()),
  sourceUrls: z.array(z.string()),
});
export type Relationship = z.infer<typeof Relationship>;

export const Revision = z.object({
  id: z.string(),
  initiativeId: z.string(),
  n: z.number().int(),
  createdAt: z.string(),
  source: z.string().nullable(),
  state: z.string().nullable(),
  archived: z.boolean(),
  title: z.string().nullable(),
  summary: z.string().nullable(),
  sections: z.record(z.string(), z.string()).nullable(),
  milestones: z
    .array(z.object({ name: z.string(), amountCents: z.number().int(), adoption: z.boolean(), done: z.boolean(), criteria: z.array(z.string()) }))
    .nullable(),
  goalCents: z.number().int().nullable(),
  fetched: z.boolean(),
});
export type Revision = z.infer<typeof Revision>;

export const ChangeRecord = z.object({
  id: z.string(),
  initiativeId: z.string().nullable(),
  detectedAt: z.string(),
  kind: z.enum([
    "funding_changed",
    "pledge_added",
    "pledge_removed",
    "pledge_status_changed",
    "pledge_amount_changed",
    "goal_changed",
    "milestones_changed",
    "milestone_completed",
    "text_changed",
    "revision_added",
    "eligibility_changed",
    "claim_status_changed",
    "correction_published",
    "donation_added",
  ]),
  summary: z.string(),
  before: z.unknown().optional(),
  after: z.unknown().optional(),
  source: z.enum(["snapshot_diff", "official_revision", "correction", "research"]),
  fromSnapshot: z.string().nullable(),
  toSnapshot: z.string().nullable(),
});
export type ChangeRecord = z.infer<typeof ChangeRecord>;

export const ResearchTask = z.enum(["links", "websites", "github", "milestone_artifacts", "claims", "donations_onchain", "curated"]);
export type ResearchTask = z.infer<typeof ResearchTask>;

export const ResearchJob = z.object({
  id: z.string(),
  initiativeId: z.string(),
  task: ResearchTask,
  state: z.enum(["pending", "running", "succeeded", "failed", "skipped"]),
  attempts: z.number().int(),
  inputHash: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  error: z.string().nullable(),
  resultCount: z.number().int().nullable(),
});
export type ResearchJob = z.infer<typeof ResearchJob>;

export const CorrectionCategory = z.enum([
  "incorrect",
  "outdated",
  "missing_context",
  "missing_evidence",
  "misattributed",
  "other",
]);
export const CorrectionState = z.enum([
  "submitted",
  "under_review",
  "disputed",
  "accepted",
  "partially_accepted",
  "rejected",
  "resolved",
]);
export type CorrectionState = z.infer<typeof CorrectionState>;

export const Correction = z.object({
  id: z.string(),
  targetType: z.enum(["claim", "initiative"]),
  targetId: z.string(),
  initiativeId: z.string().nullable(),
  category: CorrectionCategory,
  proposedCorrection: z.string(),
  evidenceUrl: z.string(),
  explanation: z.string(),
  attribution: z.string().nullable(),
  /** AES-GCM ciphertext of the optional private contact; never returned publicly. */
  contactCiphertext: z.string().nullable(),
  state: CorrectionState,
  resolution: z.string().nullable(),
  /** If accepted, the claim status/assertion applied. */
  appliedChange: z
    .object({ status: EvidenceStatus.optional(), assertion: z.string().optional(), limitation: z.string().optional() })
    .nullable(),
  submittedAt: z.string(),
  updatedAt: z.string(),
  history: z.array(z.object({ at: z.string(), state: CorrectionState, note: z.string().nullable() })),
  submitterKey: z.string(),
});
export type Correction = z.infer<typeof Correction>;

export const PublicCorrection = Correction.omit({ contactCiphertext: true, submitterKey: true });
export type PublicCorrection = z.infer<typeof PublicCorrection>;

export const DatasetMeta = z.object({
  datasetVersion: z.string(),
  generatedAt: z.string(),
  officialGeneratedAt: z.string(),
  officialSourceUrl: z.string(),
  methodologyVersion: z.string(),
  cohort: z.object({ frozenAt: z.string(), size: z.number().int(), ids: z.array(z.string()), slugs: z.array(z.string()) }),
  ingestion: z.object({
    startedAt: z.string(),
    finishedAt: z.string(),
    requests: z.number().int(),
    failedRequests: z.array(z.object({ url: z.string(), error: z.string() })),
    validation: z.array(z.object({ check: z.string(), ok: z.boolean(), detail: z.string() })),
  }),
  research: z
    .object({
      startedAt: z.string(),
      finishedAt: z.string(),
      pipelineVersion: z.string(),
      requests: z.number().int(),
      failures: z.number().int(),
    })
    .nullable(),
  snapshotId: z.string(),
  previousSnapshotId: z.string().nullable(),
  contentHash: z.string(),
});
export type DatasetMeta = z.infer<typeof DatasetMeta>;

export const Dataset = z.object({
  meta: DatasetMeta,
  initiatives: z.array(Initiative),
  milestones: z.array(Milestone),
  pledges: z.array(Pledge),
  donations: z.array(Donation),
  organizations: z.array(Organization),
  aliases: z.array(OrganizationAlias),
  people: z.array(Person),
  repositories: z.array(Repository),
  products: z.array(Product),
  integrations: z.array(Integration),
  previousGrants: z.array(PreviousGrant),
  securityProblems: z.array(SecurityProblem),
  claims: z.array(Claim),
  evidence: z.array(Evidence),
  relationships: z.array(Relationship),
  revisions: z.array(Revision),
  changes: z.array(ChangeRecord),
  researchJobs: z.array(ResearchJob),
});
export type Dataset = z.infer<typeof Dataset>;
