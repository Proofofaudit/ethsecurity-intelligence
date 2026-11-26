/**
 * Security lifecycle taxonomy (methodology v1).
 *
 * Stages follow the lifecycle requested by reviewers and are cross-referenced to the six
 * domains of the Ethereum Foundation's Trillion Dollar Security (1TS) overview
 * (https://ethereum.org/reports/trillion-dollar-security/): user experience, smart contracts,
 * infrastructure & cloud, consensus protocol, monitoring & incident response, social layer & governance.
 *
 * Mapping is rule-based and transparent: an initiative maps to a stage when its proposal text
 * contains one of the listed terms (word-boundary match). Official category slugs act as hints
 * that add a stage even without term hits. Mappings are labelled "rule-based classification"
 * everywhere they are shown and are never presented as verified facts.
 */
import type { LifecycleStage, SecurityProblem } from "./schemas";

export type OneTsDomain = "ux" | "smart_contracts" | "infrastructure" | "consensus" | "monitoring_ir" | "social_governance";

export const ONE_TS_DOMAINS: Record<OneTsDomain, string> = {
  ux: "User experience",
  smart_contracts: "Smart contracts",
  infrastructure: "Infrastructure & cloud",
  consensus: "Consensus protocol",
  monitoring_ir: "Monitoring & incident response",
  social_governance: "Social layer & governance",
};

export const STAGE_ONE_TS: Record<LifecycleStage, OneTsDomain[]> = {
  development: ["smart_contracts"],
  testing: ["smart_contracts"],
  deployment: ["smart_contracts", "infrastructure"],
  transaction_construction: ["ux"],
  signing: ["ux"],
  runtime_execution: ["smart_contracts", "consensus"],
  monitoring: ["monitoring_ir"],
  threat_detection: ["monitoring_ir"],
  incident_response: ["monitoring_ir", "social_governance"],
  recovery: ["monitoring_ir", "ux"],
  infra_opsec: ["infrastructure", "social_governance"],
};

export const SECURITY_PROBLEMS: SecurityProblem[] = [
  {
    id: "development",
    label: "Development",
    description: "Writing secure code: languages, compilers, debuggers, specifications, secure libraries and developer education.",
    terms: ["compiler", "solc", "debugger", "debugging", "language", "specification", "spec", "developer tooling", "secure development", "library", "sdk", "education", "training", "handbook", "framework"],
    officialCategoryHints: ["compilers", "research-education"],
  },
  {
    id: "testing",
    label: "Testing & verification",
    description: "Finding bugs before deployment: fuzzing, formal verification, static analysis, audits and property testing.",
    terms: ["fuzz", "fuzzing", "fuzzer", "formal verification", "formally verified", "static analysis", "symbolic", "property", "invariant", "audit", "audits", "auditor", "test suite", "testing", "lean", "coq", "proof"],
    officialCategoryHints: ["fuzzing-testing", "formal-verification", "audits-analysis"],
  },
  {
    id: "deployment",
    label: "Deployment & supply chain",
    description: "Getting reviewed code onchain intact: reproducible builds, source verification, audit-to-bytecode mapping, release integrity.",
    terms: ["reproducible build", "reproducible builds", "bytecode", "source verification", "verified source", "deployment", "deployed", "supply chain", "release", "commit", "upgrade"],
    officialCategoryHints: [],
  },
  {
    id: "transaction_construction",
    label: "Transaction construction",
    description: "What the user is asked to sign: frontends, dApp integrity, simulation, intent and calldata decoding.",
    terms: ["frontend", "front-end", "simulation", "simulate", "calldata", "dapp", "interface", "ui", "intent", "assertion", "assertions"],
    officialCategoryHints: [],
  },
  {
    id: "signing",
    label: "Signing & wallets",
    description: "Key management and the signing moment: wallets, hardware wallets, clear signing, blind-signing prevention.",
    terms: ["wallet", "wallets", "hardware wallet", "clear signing", "blind signing", "erc-7730", "signer", "signing", "multisig", "safe", "key management", "seed"],
    officialCategoryHints: ["wallets-signing"],
  },
  {
    id: "runtime_execution",
    label: "Runtime & protocol execution",
    description: "Correct execution onchain and in clients: EVM, execution/consensus clients, mempool, L2 and bridge verification.",
    terms: ["evm", "execution client", "consensus client", "client", "clients", "mempool", "light client", "bridge", "bridges", "l2", "rollup", "eip", "protocol"],
    officialCategoryHints: [],
  },
  {
    id: "monitoring",
    label: "Monitoring",
    description: "Continuous observation of deployed systems: onchain monitoring, alerts, dashboards and risk data.",
    terms: ["monitoring", "monitor", "alert", "alerts", "dashboard", "risk", "backtest", "backtestable", "onchain data"],
    officialCategoryHints: ["defi"],
  },
  {
    id: "threat_detection",
    label: "Threat detection & intelligence",
    description: "Identifying attackers and attacks: threat intelligence, phishing, address poisoning, malicious actors screening.",
    terms: ["threat intelligence", "threat", "phishing", "address poisoning", "scam", "drainer", "dprk", "malicious", "detection", "detect", "attacker", "exploit"],
    officialCategoryHints: ["detection-response"],
  },
  {
    id: "incident_response",
    label: "Incident response & disclosure",
    description: "Acting on live incidents and bugs: war rooms, forensics, bug bounties, coordinated disclosure, whitehat rescues.",
    terms: ["incident", "incident response", "forensic", "forensics", "bug bounty", "bounty", "disclosure", "whitehat", "white hat", "safe harbor", "war room", "triage", "security.txt"],
    officialCategoryHints: ["detection-response"],
  },
  {
    id: "recovery",
    label: "Recovery",
    description: "Limiting and recovering losses: rescued-fund distribution, approvals revocation, emergency freezes, coercion protection.",
    terms: ["recovery", "recover", "rescue", "rescued", "revoke", "approval", "approvals", "freeze", "emergency", "lockdown", "coercion"],
    officialCategoryHints: [],
  },
  {
    id: "infra_opsec",
    label: "Infrastructure & operational security",
    description: "Operational and infrastructure security: OpSec practices, node operations, TEEs, data availability, archives, hiring screening.",
    terms: ["opsec", "operational security", "infrastructure", "node", "nodes", "tee", "tees", "archive", "blob", "devops", "infraops", "side-channel", "hiring", "screening", "rpc"],
    officialCategoryHints: ["opsec", "infrastructure"],
  },
];

export const STAGE_LABEL: Record<LifecycleStage, string> = Object.fromEntries(SECURITY_PROBLEMS.map((p) => [p.id, p.label])) as Record<
  LifecycleStage,
  string
>;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Rule-based stage mapping. Returns stages ordered by hits; at most `max` stages. */
export function classifyStages(
  text: string,
  officialCategorySlugs: string[],
  max = 4,
): { stage: LifecycleStage; matchedTerms: string[]; hits: number; primary: boolean }[] {
  const lower = text.toLowerCase();
  const results: { stage: LifecycleStage; matchedTerms: string[]; hits: number }[] = [];
  for (const p of SECURITY_PROBLEMS) {
    const matched: string[] = [];
    let hits = 0;
    for (const term of p.terms) {
      const re = new RegExp(`(?<![a-z0-9])${escape(term)}(?![a-z0-9])`, "g");
      const n = lower.match(re)?.length ?? 0;
      if (n > 0) {
        matched.push(term);
        hits += n;
      }
    }
    const hinted = p.officialCategoryHints.some((h) => officialCategorySlugs.includes(h));
    // Require either an official category hint, or at least two distinct terms with 3+ hits,
    // so a single incidental word ("wallet" once) does not create a mapping.
    if (hinted || (matched.length >= 2 && hits >= 3)) {
      results.push({ stage: p.id, matchedTerms: hinted && matched.length === 0 ? ["official category"] : matched, hits: hits + (hinted ? 5 : 0) });
    }
  }
  results.sort((a, b) => b.hits - a.hits || a.stage.localeCompare(b.stage));
  return results.slice(0, max).map((r, i) => ({ ...r, primary: i === 0 }));
}

/** Standards referenced in text: ERC-/EIP-/RIP- numbers. */
export function extractStandards(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\b(ERC|EIP|RIP)[-\s]?(\d{2,5})\b/gi)) {
    out.add(`${(m[1] ?? "").toUpperCase()}-${m[2]}`);
  }
  return [...out].sort();
}
