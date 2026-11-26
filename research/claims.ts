/**
 * Claim extraction (deterministic) and verification against collected evidence.
 *
 * Extraction and verification are separate steps:
 *  1. extract*: find material assertions in official records and proposal text.
 *  2. verify: assign an evidence status using only machine-observed evidence.
 * Rules are documented in METHODOLOGY.md §Claims. Nothing is marked "contradicted" because
 * evidence is missing; missing evidence yields "not_independently_verified".
 */
import type { Claim, ClaimKind, EvidenceStatus, Initiative, Integration, Milestone, Pledge, PreviousGrant } from "@/lib/domain/schemas";
import { stableId } from "@/lib/util/hash";
import { formatUsd } from "@/lib/util/money";
import { sentences, extractLinks, truncate } from "@/lib/util/text";
import { evidenceId } from "./evidence";
import { parseGithub } from "./collect";
import type { UrlCheck } from "./web";
import type { PullFacts, RepoFacts } from "./github";
import type { TxCheck } from "./onchain";

export const CLAIMS_VERSION = "claims@1";

export interface ClaimContext {
  ini: Initiative;
  milestones: Milestone[];
  pledges: Pledge[];
  donations: { txHash: string; amountUsdCents: number | null }[];
  urlChecks: Map<string, UrlCheck>;
  repos: Map<string, RepoFacts>;
  pulls: Map<string, PullFacts>;
  txChecks: Map<string, TxCheck>;
  owners: Map<string, { login: string; createdAt: string | null; publicRepos: number | null }>;
  now: string;
}

type Draft = Omit<Claim, "id" | "history" | "verifiedAt"> & { key: string };

const PRIOR_WORK_SECTIONS = new Set(["team", "why_grant", "why", "details"]);

const QUANT_RE =
  /(\$\s?\d[\d,.]*\s?(k|m|bn|million|billion)?\b|\b\d[\d,.]*\s?(\+|k|m)?\s+(users|protocols|audits|wallets|downloads|installs|reports|incidents|teams|projects|chains|contracts|transactions|subscribers|readers|bugs|vulnerabilities|clients|integrations|deployments|addresses|alerts|exploits|organi[sz]ations|issues|findings|researchers|members|customers|developers|repositories|repos|stars|requests|calls|signatures|rescues|hacks)\b)/i;
const INTEGRATION_RE = /\b(integrated (with|into|in)|is used by|are used by|used in production|in production (at|by|on)|deployed (by|at|on|across)|adopted by|live (on|in|at)|partnered with|partnership with|powers)\b/i;
const FUNDING_RE = /\b(grant(ed)? (from|by)|funded by|ESP|Ecosystem Support Program|Gitcoin|RetroPGF|Retro Funding|Octant|Protocol Guild|backed by|raised|seed round|previous(ly)? funded|received (a|an) .{0,30}grant)\b/i;

function linksIn(sentence: string, all: { url: string; text: string | null }[]): string[] {
  const direct = extractLinks(sentence).map((l) => l.url);
  const byText = all.filter((l) => l.text && sentence.includes(l.text)).map((l) => l.url);
  return [...new Set([...direct, ...byText])];
}

function urlStatus(urls: string[], ctx: ClaimContext): { supported: string[]; unreachable: string[]; inconclusive: string[] } {
  const supported: string[] = [];
  const unreachable: string[] = [];
  const inconclusive: string[] = [];
  for (const u of urls) {
    const g = parseGithub(u);
    if (g?.repo) {
      const r = ctx.repos.get(`${g.owner}/${g.repo}`.toLowerCase());
      if (r?.exists) supported.push(evidenceId.repo(r.fullName));
      else if (r) inconclusive.push(evidenceId.repo(r.fullName));
      continue;
    }
    const c = ctx.urlChecks.get(u);
    if (!c) continue;
    if (c.ok) supported.push(evidenceId.http(u));
    else if (c.inconclusive) inconclusive.push(evidenceId.http(u));
    else unreachable.push(evidenceId.http(u));
  }
  return { supported, unreachable, inconclusive };
}

export function extractClaims(ctx: ClaimContext): { claims: Draft[]; integrations: Integration[]; previousGrants: PreviousGrant[] } {
  const { ini } = ctx;
  const drafts: Draft[] = [];
  const integrations: Integration[] = [];
  const previousGrants: PreviousGrant[] = [];
  const official = evidenceId.official(ini.id);
  const base = { initiativeId: ini.id, contradictingEvidenceIds: [] as string[] };

  // 1. Milestones: deliverables (future) and completions (officially reported, artifact-checked).
  for (const m of ctx.milestones) {
    const crit = m.criteria.length ? m.criteria.join(" · ") : "no acceptance criterion recorded";
    if (!m.done) {
      drafts.push({
        ...base,
        key: `ms:${m.index}`,
        kind: m.adoption ? "adoption_commitment" : "milestone_deliverable",
        assertion: `${m.adoption ? "Adoption milestone" : "Milestone"} "${m.name}" (${formatUsd(m.amountCents)}) is planned to deliver: ${truncate(crit, 400)}`,
        origin: "applicant",
        section: `milestone:${m.index}`,
        quote: truncate(crit, 600),
        sourceUrls: [ini.url],
        evidenceIds: [official],
        supportingEvidenceIds: [],
        status: "future_target",
        verificationMethod: "Planned deliverable from the official milestone record. Future work cannot be verified as existing.",
        limitations: m.adoption ? ["Depends on third-party adoption that the applicant does not control."] : [],
        material: true,
      });
    } else {
      const link = m.link;
      let status: EvidenceStatus = "officially_reported";
      const supporting: string[] = [];
      const evidenceIds = [official];
      const limitations: string[] = [];
      let method = "Completion flag from the official milestone record.";
      if (link) {
        const g = parseGithub(link);
        const pr = ctx.pulls.get(link);
        if (g?.pull && pr) {
          evidenceIds.push(evidenceId.pull(pr.url));
          if (pr.merged) {
            status = "partially_supported";
            supporting.push(evidenceId.pull(pr.url));
            method += ` Linked pull request was merged on ${pr.mergedAt?.slice(0, 10)} (GitHub API).`;
            limitations.push("A merged pull request shows the change landed; the acceptance criterion itself was not independently evaluated.");
          } else {
            status = "not_independently_verified";
            method += ` Linked pull request state is "${pr.state ?? "unknown"}" and not merged.`;
          }
        } else {
          const c = ctx.urlChecks.get(link);
          const repo = g?.repo ? ctx.repos.get(`${g.owner}/${g.repo}`.toLowerCase()) : undefined;
          if (repo?.exists || c?.ok) {
            status = "partially_supported";
            const id = repo ? evidenceId.repo(repo.fullName) : evidenceId.http(link);
            supporting.push(id);
            evidenceIds.push(id);
            method += " Linked artifact is publicly reachable.";
            limitations.push("Reachability of the linked artifact does not show that the acceptance criterion was met.");
          }
        }
      } else {
        limitations.push("No public artifact is linked to this completed milestone.");
      }
      drafts.push({
        ...base,
        key: `msdone:${m.index}`,
        kind: "milestone_completed",
        assertion: `Milestone "${m.name}" (${formatUsd(m.amountCents)}) is complete.`,
        origin: "official",
        section: `milestone:${m.index}`,
        quote: truncate(crit, 600),
        sourceUrls: [ini.url, ...(link ? [link] : [])],
        evidenceIds,
        supportingEvidenceIds: supporting,
        status,
        verificationMethod: method,
        limitations,
        material: true,
      });
    }
  }

  // 2. Funding: pledges are official admin-entered records; donations are verified onchain.
  for (const p of ctx.pledges) {
    drafts.push({
      ...base,
      key: `pledge:${p.id}`,
      kind: p.status === "received" ? "funding_received" : "funding_pledge",
      assertion:
        p.status === "received"
          ? `${p.company} pledged ${formatUsd(p.amountCents)} and the pledge is marked received.`
          : `${p.company} has pledged ${formatUsd(p.amountCents)} (not yet marked received).`,
      origin: "official",
      section: "funding",
      quote: null,
      sourceUrls: [ini.url],
      evidenceIds: [official],
      supportingEvidenceIds: [official],
      status: "officially_reported",
      verificationMethod: "Pledge row from the official initiative endpoint (entered by TheDAO Security Fund admins).",
      limitations: [
        p.status === "received"
          ? "Received pledges arrive as onchain donations and are already included in the donated total; they are not added again."
          : "An outstanding pledge is a commitment, not funds held by the initiative's Safe.",
      ],
      material: true,
    });
  }
  if (ctx.donations.length > 0) {
    const checks = ctx.donations.map((d) => ctx.txChecks.get(d.txHash));
    const verified = checks.filter((c) => c?.found && c.success && c.touchesSafe);
    const all = verified.length === ctx.donations.length;
    drafts.push({
      ...base,
      key: "donations",
      kind: "donation",
      assertion: `The official ledger lists ${ctx.donations.length} confirmed donation transaction${ctx.donations.length === 1 ? "" : "s"} to the initiative's Safe, totalling ${formatUsd(ini.funding.donatedCents, { precise: true })}.`,
      origin: "official",
      section: "funding",
      quote: null,
      sourceUrls: [ini.url, ...(ini.safeAddress ? [`https://etherscan.io/address/${ini.safeAddress}`] : [])],
      evidenceIds: [official, ...ctx.donations.map((d) => evidenceId.tx(d.txHash))],
      supportingEvidenceIds: verified.map((c) => evidenceId.tx((c as TxCheck).txHash)),
      status: all ? "independently_verified" : verified.length > 0 ? "partially_supported" : "officially_reported",
      verificationMethod: `Each transaction receipt was fetched from public Ethereum JSON-RPC: ${verified.length}/${ctx.donations.length} exist, succeeded and transferred to the Safe.`,
      limitations: ["USD values are the official ledger's valuation at receipt; we did not re-price tokens."],
      material: true,
    });
  }

  // 3. Proposal text: cited artefacts, quantitative statements, integrations, prior funding.
  const allLinks = ini.textLinks.map((l) => ({ url: l.url, text: l.text }));
  const seenRepos = new Set<string>();
  for (const l of ini.textLinks) {
    const g = parseGithub(l.url);
    if (!g?.repo) continue;
    const key = `${g.owner}/${g.repo}`.toLowerCase();
    if (seenRepos.has(key)) continue;
    seenRepos.add(key);
    const r = ctx.repos.get(key);
    const exists = r?.exists ?? false;
    const lim: string[] = ["Repository existence and activity do not measure security quality."];
    if (r?.archived) lim.push("The repository is archived.");
    if (r?.fork) lim.push("The repository is a fork; authorship of changes was not attributed.");
    drafts.push({
      ...base,
      key: `repo:${key}`,
      kind: "existing_artifact",
      assertion: `The proposal cites the public repository ${r?.fullName ?? key}${l.section.startsWith("milestone") ? " in a milestone" : ""}.`,
      origin: "applicant",
      section: l.section,
      quote: l.text,
      sourceUrls: [ini.url, l.url],
      evidenceIds: r ? [evidenceId.repo(r.fullName)] : [],
      supportingEvidenceIds: exists && r ? [evidenceId.repo(r.fullName)] : [],
      status: exists ? "independently_verified" : "not_independently_verified",
      verificationMethod: exists
        ? `GitHub API confirms the repository is public${r?.pushedAt ? `; last push ${r.pushedAt.slice(0, 10)}` : ""}${r?.license ? `; licence ${r.license}` : "; no licence detected"}.`
        : "The repository could not be retrieved (it may be private, renamed or removed).",
      limitations: exists ? lim : ["Not finding a repository is not evidence that the work does not exist."],
      material: PRIOR_WORK_SECTIONS.has(l.section),
    });
  }

  for (const section of ini.sections) {
    const sents = sentences(section.markdown);
    let quantCount = 0;
    for (const s of sents) {
      const urls = linksIn(s, allLinks);
      const st = urlStatus(urls, ctx);
      if (PRIOR_WORK_SECTIONS.has(section.key) && QUANT_RE.test(s) && quantCount < 8 && s.length < 500) {
        quantCount++;
        drafts.push({
          ...base,
          key: `quant:${section.key}:${s.slice(0, 80)}`,
          kind: "quantitative",
          assertion: truncate(s, 400),
          origin: "applicant",
          section: section.key,
          quote: truncate(s, 600),
          sourceUrls: [ini.url, ...urls],
          evidenceIds: [evidenceId.proposal(ini.id, section.key), ...st.supported, ...st.inconclusive, ...st.unreachable],
          supportingEvidenceIds: [],
          status: st.supported.length ? "partially_supported" : "applicant_reported",
          verificationMethod: st.supported.length
            ? "Quantitative statement from the proposal. A cited source is reachable, but the figure itself was not independently recomputed."
            : "Quantitative statement from the proposal. No independent source for the figure was examined.",
          limitations: ["Figures are as stated by the applicant unless a supporting source is listed."],
          material: true,
        });
      }
      if (INTEGRATION_RE.test(s) && s.length < 500) {
        const planned = /\b(will|plan|planned|aim|target|intend|going to|expected to)\b/i.test(s);
        const status: EvidenceStatus = planned ? "future_target" : st.supported.length ? "partially_supported" : "applicant_reported";
        const counterparty =
          /\b(?:with|into|in|by|at|on|across|powers)\s+(?:the\s+)?((?:[A-Z][\w.'’-]*(?:\s+|,\s*|\s+and\s+)?){1,5})/.exec(s)?.[1]?.trim().replace(/[,\s]+$/, "").replace(/(\s+and)$/, "") ?? "unspecified";
        const id = stableId("int", ini.id, s.slice(0, 120));
        integrations.push({
          id,
          initiativeId: ini.id,
          counterparty,
          statement: truncate(s, 400),
          section: section.key,
          kind: planned ? "planned" : "existing",
          status,
          sourceUrls: [ini.url, ...urls],
          provenance: { origin: "applicant", sourceUrls: [ini.url], retrievedAt: ctx.now, method: "Pattern-matched integration statement in proposal text", version: CLAIMS_VERSION },
        });
        drafts.push({
          ...base,
          key: `int:${section.key}:${s.slice(0, 80)}`,
          kind: "integration",
          assertion: truncate(s, 400),
          origin: "applicant",
          section: section.key,
          quote: truncate(s, 600),
          sourceUrls: [ini.url, ...urls],
          evidenceIds: [evidenceId.proposal(ini.id, section.key), ...st.supported, ...st.inconclusive],
          supportingEvidenceIds: [],
          status,
          verificationMethod: planned
            ? "Planned integration stated in the proposal."
            : st.supported.length
              ? "Integration stated in the proposal; a cited source is reachable but the integration itself was not tested."
              : "Integration stated in the proposal; no independent confirmation from the counterparty was examined.",
          limitations: ["Counterparty confirmation was not obtained; we do not contact teams."],
          material: true,
        });
      }
      const prose = s.replace(/https?:\/\/\S+/g, "").trim();
      const negated = /^(no|none|not)\b|\bno (previous|prior|other)\b|\bnot (been |yet )?(funded|received)\b/i.test(prose);
      if (PRIOR_WORK_SECTIONS.has(section.key) && FUNDING_RE.test(prose) && !negated && prose.length >= 30 && s.length < 500) {
        const funder = /\b(Ethereum Foundation|ESP|Gitcoin|Optimism|Octant|Protocol Guild|Arbitrum|Uniswap|Aave|Compound|Lido|Safe|Polygon|Starknet|zkSync|Scroll|Base|Coinbase|a16z|Paradigm)\b/.exec(s)?.[1] ?? "unspecified";
        const amount = /\$\s?(\d[\d,.]*)\s?(k|m|million)?/i.exec(s);
        let amountCents: number | null = null;
        if (amount?.[1]) {
          const n = Number(amount[1].replace(/,/g, ""));
          const mult = amount[2] ? (/^k$/i.test(amount[2]) ? 1e3 : 1e6) : 1;
          if (Number.isFinite(n)) amountCents = Math.round(n * mult * 100);
        }
        previousGrants.push({
          id: stableId("pg", ini.id, s.slice(0, 120)),
          initiativeId: ini.id,
          funder,
          statement: truncate(s, 400),
          amountCents,
          status: st.supported.length ? "partially_supported" : "applicant_reported",
          sourceUrls: [ini.url, ...urls],
          provenance: { origin: "applicant", sourceUrls: [ini.url], retrievedAt: ctx.now, method: "Pattern-matched funding statement in proposal text", version: CLAIMS_VERSION },
        });
        drafts.push({
          ...base,
          key: `fund:${section.key}:${s.slice(0, 80)}`,
          kind: "previous_funding",
          assertion: truncate(s, 400),
          origin: "applicant",
          section: section.key,
          quote: truncate(s, 600),
          sourceUrls: [ini.url, ...urls],
          evidenceIds: [evidenceId.proposal(ini.id, section.key), ...st.supported],
          supportingEvidenceIds: [],
          status: st.supported.length ? "partially_supported" : "applicant_reported",
          verificationMethod: "Funding history stated in the proposal; funder records were not independently retrieved.",
          limitations: ["Check for deliverables that overlap with previously funded work."],
          material: true,
        });
      }
    }
  }

  // 4. Team: linked public professional profiles.
  const team = ini.sections.find((s) => s.key === "team");
  if (team) {
    for (const l of extractLinks(team.markdown)) {
      const g = parseGithub(l.url);
      if (!g || g.repo || !l.text) continue;
      const owner = ctx.owners.get(g.owner.toLowerCase());
      const exists = !!owner;
      drafts.push({
        ...base,
        key: `team:${l.url}`,
        kind: "team",
        assertion: `The team section links ${l.text} to the public GitHub profile ${g.owner}.`,
        origin: "applicant",
        section: "team",
        quote: l.text,
        sourceUrls: [ini.url, l.url],
        evidenceIds: owner ? [evidenceId.profile(g.owner)] : [],
        supportingEvidenceIds: [],
        status: "applicant_reported",
        verificationMethod: `Profile link provided by the applicant${exists ? `; GitHub confirms the account exists (${owner?.publicRepos ?? "?"} public repositories, created ${owner?.createdAt?.slice(0, 10) ?? "unknown"})` : "; the account could not be retrieved"}. We did not verify that the profile belongs to the named person.`,
        limitations: ["Identity of profile owners is not verified."],
        material: false,
      });
    }
  }

  return { claims: drafts, integrations, previousGrants };
}

export function finalizeClaims(drafts: Draft[], previous: Map<string, Claim>, now: string): Claim[] {
  const seen = new Set<string>();
  const out: Claim[] = [];
  for (const d of drafts) {
    const id = stableId("cl", d.initiativeId, d.key);
    if (seen.has(id)) continue;
    seen.add(id);
    const { key: _key, ...rest } = d;
    void _key;
    const prev = previous.get(id);
    const history = prev?.history ? [...prev.history] : [];
    if (!prev) history.push({ at: now, status: rest.status, assertion: rest.assertion, reason: "First extracted", correctionId: null });
    else if (prev.status !== rest.status || prev.assertion !== rest.assertion)
      history.push({ at: now, status: rest.status, assertion: rest.assertion, reason: `Re-verification changed ${prev.status !== rest.status ? `status from ${prev.status}` : "assertion text"}`, correctionId: null });
    const verified = ["independently_verified", "partially_supported", "contradicted"].includes(rest.status);
    out.push({ ...rest, id, history, verifiedAt: verified ? now : null });
  }
  return out;
}

export type { Draft as ClaimDraft };
export const CLAIM_KIND_LABEL: Record<ClaimKind, string> = {
  milestone_deliverable: "Planned deliverable",
  milestone_completed: "Completed milestone",
  existing_artifact: "Existing artefact",
  quantitative: "Quantitative statement",
  integration: "Integration",
  previous_funding: "Previous funding",
  funding_pledge: "Pledge",
  funding_received: "Received pledge",
  donation: "Donations",
  team: "Team profile",
  adoption_commitment: "Adoption commitment",
  curated_finding: "Curated finding",
};
