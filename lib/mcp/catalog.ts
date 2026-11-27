/**
 * Catalog of the read-only MCP tools. The server registers exactly these tools with these
 * descriptions, and generated research skills list them from here, so the two never drift.
 * Several requested capabilities are consolidated into one tool with a parameter to keep tool
 * descriptions short for the assistant's context window.
 */
export interface ToolInfo {
  name: string;
  title: string;
  description: string;
  /** Requested capability names this tool covers, and how. */
  covers: { name: string; how: string }[];
}

export const MCP_SERVER_NAME = "ethsecurity-intelligence";
export const MCP_MAX_ITEMS = 50;

export const TOOLS: ToolInfo[] = [
  {
    name: "list_initiatives",
    title: "List and filter initiatives",
    description:
      "List the ballot-cohort initiatives with optional filters (text query, official categories, lifecycle stages, type, funding ranges, evidence and milestone flags, organization). Alphabetical by default; no ranking. Paginated with a cursor, at most 50 items per page.",
    covers: [
      { name: "list_initiatives", how: "Call without filters." },
      { name: "filter_initiatives", how: "Call with filter parameters." },
    ],
  },
  {
    name: "get_initiative",
    title: "Get an initiative dossier",
    description:
      "Research dossier for one initiative by id or slug. Choose sections: overview, proposal, milestones, funding, claims, evidence, team, technical, reality, related, blind_spots, changes, revisions, metrics, research_jobs. Default: overview, milestones, funding, reality.",
    covers: [
      { name: "get_initiative", how: "Default sections." },
      { name: "get_milestones", how: "sections: [\"milestones\"]" },
      { name: "get_team", how: "sections: [\"team\"] (people, organization and aliases)" },
      { name: "get_funding_breakdown", how: "sections: [\"funding\"]" },
    ],
  },
  {
    name: "get_entity",
    title: "Get an organization, person or other entity",
    description:
      "Profile of one entity by type and id: organization (recipient and/or backer, with its pledges), person, repository, standard, product or problem (lifecycle stage). Ids come from other tool results.",
    covers: [
      { name: "get_organization", how: "type: \"organization\"" },
      { name: "get_team", how: "type: \"person\"" },
      { name: "get_backers", how: "type: \"organization\" lists that backer's pledges" },
    ],
  },
  {
    name: "get_funding",
    title: "Funding breakdown, backers and funding relationships",
    description:
      "scope \"initiative\": official funding figures (theDaoAskCents: goal minus raised, capped at $200,000), pledges, donations and metrics for one initiative. scope \"backers\": backers with cohort totals (paginated). scope \"relationships\": multi-initiative backers, self-pledges, identity candidates, concentration. scope \"vote_manifest\": the official vote manifest (pool, schedule, groups) with its alignment check. scope \"round1\": Round 1 funding records matched to one initiative, with reasons.",
    covers: [
      { name: "get_funding_breakdown", how: "scope: \"initiative\"" },
      { name: "get_backers", how: "scope: \"backers\"" },
      { name: "analyze_funding_relationships", how: "scope: \"relationships\"" },
      { name: "get_vote_manifest", how: "scope: \"vote_manifest\"" },
      { name: "get_round1_history", how: "scope: \"round1\"" },
    ],
  },
  {
    name: "get_claim",
    title: "Get a claim and optionally trace its impact",
    description:
      "One claim by id with its evidence status, evidence records and public corrections. With trace: true, also lists which metrics, views and other initiatives depend on it.",
    covers: [
      { name: "get_claim", how: "trace: false" },
      { name: "trace_claim", how: "trace: true" },
    ],
  },
  {
    name: "get_evidence",
    title: "Get evidence records",
    description: "One evidence record by id with the claims that cite it, or all evidence records cited by one initiative's claims (paginated).",
    covers: [{ name: "get_evidence", how: "evidenceId or initiative" }],
  },
  {
    name: "get_corrections",
    title: "Public corrections changelog",
    description: "Moderated public corrections, newest first, optionally for one initiative or one target id. Private contact details and internal moderator notes are never included.",
    covers: [{ name: "get_corrections", how: "Direct." }],
  },
  {
    name: "get_changes",
    title: "Changes over time",
    description: "Change log (official snapshot differences and proposal revisions), optionally filtered by date, initiatives and kinds. Paginated.",
    covers: [{ name: "get_changes", how: "Direct." }],
  },
  {
    name: "get_metrics",
    title: "Metric values and definitions",
    description: "Computed metric values for the cohort or one initiative, with the registry definition (formula, unit, source fields, missing-data rule) of each metric.",
    covers: [{ name: "get_metrics", how: "Direct." }],
  },
  {
    name: "compare_initiatives",
    title: "Compare initiatives side by side",
    description: "Side-by-side comparison of 2 to 5 initiatives: funding, milestones, adoption, evidence, technical facts, dependencies and quoted beneficiary and maintenance statements, with a flag where values differ.",
    covers: [{ name: "compare_initiatives", how: "Direct." }],
  },
  {
    name: "detect_overlap",
    title: "Possible overlaps and complements (hypotheses)",
    description:
      "Rule-based overlap and complement hypotheses with the signals that produced them. Without ids: every published hypothesis (paginated). With 2 to 8 ids: deterministic signals for every pair among them. Hypotheses are prompts for investigation, not findings.",
    covers: [{ name: "detect_overlap", how: "Direct." }],
  },
  {
    name: "get_dependencies",
    title: "Dependencies",
    description: "Standards, external repositories, adoption milestones and planned integrations each initiative depends on, for one initiative or the cohort (paginated).",
    covers: [{ name: "get_dependencies", how: "Direct." }],
  },
  {
    name: "get_security_coverage",
    title: "Security coverage by lifecycle stage and category",
    description: "How the cohort covers the security lifecycle stages (rule-based tags) and the official categories, with the initiatives in each. Counts describe this cohort only.",
    covers: [{ name: "get_security_coverage", how: "Direct." }],
  },
  {
    name: "find_evidence_gaps",
    title: "Evidence gaps and open questions",
    description: "Research blind spots: adoption dependencies, brief acceptance criteria, unconfirmed integrations, unsupported figures, missing maintenance plans and possible overlaps, each with the question to ask and its basis. Filter by initiative, category or importance. Paginated.",
    covers: [{ name: "find_evidence_gaps", how: "Direct." }],
  },
  {
    name: "simulate_portfolio",
    title: "What-if portfolio arithmetic",
    description:
      "Deterministic arithmetic over your assumptions for a list of initiatives: pledge conversion, alternative funding, excluded adoption milestones, delays, unavailable integrations or standards, and an optional budget applied in the order given. Not a prediction.",
    covers: [{ name: "simulate_portfolio", how: "Direct." }],
  },
  {
    name: "export_research",
    title: "Export an evidence bundle",
    description: "Evidence bundle (initiatives with metrics, milestones, pledges, claims, evidence and relationships) for 1 to 5 initiatives, optionally limited to some parts. For the whole cohort, download the bundle file from the REST API path in fullCohortDownloadPath.",
    covers: [{ name: "export_research", how: "Direct." }],
  },
];

export const REQUESTED_CAPABILITIES = [
  "list_initiatives",
  "get_initiative",
  "get_organization",
  "get_team",
  "get_backers",
  "get_funding_breakdown",
  "get_milestones",
  "get_claim",
  "trace_claim",
  "get_evidence",
  "get_corrections",
  "get_changes",
  "get_metrics",
  "filter_initiatives",
  "compare_initiatives",
  "detect_overlap",
  "get_dependencies",
  "get_security_coverage",
  "find_evidence_gaps",
  "analyze_funding_relationships",
  "simulate_portfolio",
  "export_research",
] as const;

export interface McpConnection {
  remoteUrl: string;
  stdio: { command: string; args: string[]; note: string };
  clients: { name: string; file: string; config: string }[];
}

/** Connection instructions for the stdio and Streamable HTTP transports. */
export function mcpConnection(siteUrl: string, repoPath = "/path/to/ethsecurity-intelligence"): McpConnection {
  const remoteUrl = `${siteUrl.replace(/\/+$/, "")}/api/mcp`;
  const stdioArgs = ["run", "--silent", "--prefix", repoPath, "mcp"];
  const json = (v: unknown) => JSON.stringify(v, null, 2);
  return {
    remoteUrl,
    stdio: {
      command: "npm",
      args: stdioArgs,
      note: "Local stdio server from a clone of the repository (after npm ci). It reads data/published/dataset.json, or MongoDB when MONGODB_URI is set in the environment.",
    },
    clients: [
      { name: "Claude Desktop (local stdio)", file: "claude_desktop_config.json", config: json({ mcpServers: { [MCP_SERVER_NAME]: { command: "npm", args: stdioArgs } } }) },
      { name: "Claude Code (remote)", file: "shell", config: `claude mcp add --transport http ${MCP_SERVER_NAME} ${remoteUrl}` },
      { name: "Cursor (remote)", file: ".cursor/mcp.json", config: json({ mcpServers: { [MCP_SERVER_NAME]: { url: remoteUrl } } }) },
      { name: "VS Code (remote)", file: ".vscode/mcp.json", config: json({ servers: { [MCP_SERVER_NAME]: { type: "http", url: remoteUrl } } }) },
    ],
  };
}
