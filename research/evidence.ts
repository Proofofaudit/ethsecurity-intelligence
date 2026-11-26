/**
 * Build Evidence records from official records and collected research results.
 * Evidence records hold machine-observed facts only (status codes, timestamps, flags).
 */
import type { Evidence, Initiative, Provenance } from "@/lib/domain/schemas";
import { stableId } from "@/lib/util/hash";
import type { UrlCheck } from "./web";
import type { PullFacts, RepoFacts } from "./github";
import type { TxCheck } from "./onchain";
import { PIPELINE_VERSION } from "./collect";

const prov = (origin: Provenance["origin"], method: string, urls: string[], at: string): Provenance => ({
  origin,
  sourceUrls: urls,
  retrievedAt: at,
  method,
  version: PIPELINE_VERSION,
});

export const evidenceId = {
  official: (initiativeId: string) => stableId("ev", "official", initiativeId),
  http: (url: string) => stableId("ev", "http", url),
  repo: (fullName: string) => stableId("ev", "repo", fullName.toLowerCase()),
  pull: (url: string) => stableId("ev", "pull", url),
  profile: (login: string) => stableId("ev", "ghprofile", login.toLowerCase()),
  tx: (hash: string) => stableId("ev", "tx", hash.toLowerCase()),
  proposal: (initiativeId: string, section: string) => stableId("ev", "proposal", initiativeId, section),
};

export function officialEvidence(ini: Initiative): Evidence {
  return {
    id: evidenceId.official(ini.id),
    kind: "official_record",
    url: ini.url,
    title: `Official record: ${ini.title}`,
    observedAt: ini.provenance.retrievedAt,
    facts: {
      goalUsd: ini.funding.goalCents / 100,
      officialRaisedUsd: ini.funding.officialRaisedCents / 100,
      pledgedUsd: ini.funding.pledgedCents / 100,
      receivedPledgesUsd: ini.funding.receivedCents / 100,
      donatedUsd: ini.funding.donatedCents / 100,
      onBallot: ini.onBallot,
      revision: ini.revision,
      apiUrl: ini.provenance.sourceUrls[0] ?? null,
    },
    excerpt: null,
    ok: true,
    provenance: prov("official", "TheDAO Security Fund API", ini.provenance.sourceUrls, ini.provenance.retrievedAt),
  };
}

export function proposalEvidence(ini: Initiative, sectionKey: string): Evidence {
  const s = ini.sections.find((x) => x.key === sectionKey);
  return {
    id: evidenceId.proposal(ini.id, sectionKey),
    kind: "proposal_text",
    url: `${ini.url}#${sectionKey}`,
    title: `Proposal section "${s?.heading ?? sectionKey}" (applicant text)`,
    observedAt: ini.provenance.retrievedAt,
    facts: { section: sectionKey, revision: ini.revision },
    excerpt: s ? s.markdown.slice(0, 600) : null,
    ok: true,
    provenance: prov("applicant", "Proposal text from the official API", [ini.url], ini.provenance.retrievedAt),
  };
}

export function httpEvidence(c: UrlCheck): Evidence {
  return {
    id: evidenceId.http(c.url),
    kind: "http_check",
    url: c.url,
    title: c.title ?? c.url,
    observedAt: c.checkedAt,
    facts: {
      status: c.status,
      finalUrl: c.finalUrl,
      reachable: c.ok,
      inconclusive: c.inconclusive,
      contentType: c.contentType,
      error: c.error,
    },
    excerpt: c.description,
    ok: c.ok,
    provenance: prov("external", "HTTP GET (first 256 KB), title and meta description extracted", [c.url], c.checkedAt),
  };
}

export function repoEvidence(r: RepoFacts): Evidence {
  return {
    id: evidenceId.repo(r.fullName),
    kind: "github_repository",
    url: r.url,
    title: `GitHub repository ${r.fullName}`,
    observedAt: r.checkedAt,
    facts: {
      exists: r.exists,
      license: r.license,
      archived: r.archived,
      fork: r.fork,
      createdAt: r.createdAt,
      pushedAt: r.pushedAt,
      latestRelease: r.latestRelease?.tag ?? null,
      latestReleaseAt: r.latestRelease?.publishedAt ?? null,
      releases: r.releaseCount,
      ciWorkflows: r.hasCiWorkflows,
      testsDirectory: r.hasTestsDir,
      securityPolicy: r.hasSecurityPolicy,
      commitsLast90d: r.commitsLast90d,
      contributorsSampled: r.contributorsSampled,
      language: r.language,
      stars: r.stars,
      error: r.error,
    },
    excerpt: r.description,
    ok: r.exists,
    provenance: prov("external", "GitHub REST API: repository, releases, root contents, workflows, commits (90d), contributors", [r.url], r.checkedAt),
  };
}

export function pullEvidence(p: PullFacts): Evidence {
  return {
    id: evidenceId.pull(p.url),
    kind: "github_pull_request",
    url: p.url,
    title: p.title ? `PR: ${p.title}` : p.url,
    observedAt: p.checkedAt,
    facts: { exists: p.exists, state: p.state, merged: p.merged, mergedAt: p.mergedAt, author: p.author },
    excerpt: null,
    ok: p.exists,
    provenance: prov("external", "GitHub REST API pull request lookup", [p.url], p.checkedAt),
  };
}

export function profileEvidence(o: { login: string; type: string; name: string | null; createdAt: string | null; publicRepos: number | null; url: string; blog: string | null }, at: string): Evidence {
  return {
    id: evidenceId.profile(o.login),
    kind: "github_profile",
    url: o.url,
    title: `GitHub ${o.type === "Organization" ? "organisation" : "user"} ${o.login}`,
    observedAt: at,
    facts: { login: o.login, type: o.type, name: o.name, createdAt: o.createdAt, publicRepos: o.publicRepos, blog: o.blog },
    excerpt: null,
    ok: true,
    provenance: prov("external", "GitHub REST API users endpoint", [o.url], at),
  };
}

export function txEvidence(t: TxCheck, safe: string | null): Evidence {
  return {
    id: evidenceId.tx(t.txHash),
    kind: "onchain_transaction",
    url: `https://etherscan.io/tx/${t.txHash}`,
    title: `Transaction ${t.txHash.slice(0, 10)}…`,
    observedAt: t.checkedAt,
    facts: { found: t.found, success: t.success, blockNumber: t.blockNumber, touchesSafe: t.touchesSafe, safe, rpc: t.rpc },
    excerpt: null,
    ok: t.found && t.success === true && t.touchesSafe === true,
    provenance: prov("external", "eth_getTransactionReceipt via public JSON-RPC; checks success and that the Safe is the recipient or emits a log", [`https://etherscan.io/tx/${t.txHash}`], t.checkedAt),
  };
}
