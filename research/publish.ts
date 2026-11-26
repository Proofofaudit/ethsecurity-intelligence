/**
 * Publish: assemble official layer + research results + curated findings into one validated
 * Dataset. The dataset is written to data/published/dataset.json only if every invariant
 * passes; otherwise the previous published dataset stays in place.
 */
import path from "node:path";
import type {
  Claim,
  Dataset,
  Evidence,
  EvidenceStatus,
  Organization,
  Product,
  Relationship,
  Repository,
} from "@/lib/domain/schemas";
import { Dataset as DatasetSchema } from "@/lib/domain/schemas";
import { SECURITY_PROBLEMS } from "@/lib/domain/taxonomy";
import { identityDomain } from "@/lib/domain/identity";
import { contentHash, stableId } from "@/lib/util/hash";
import { slugify } from "@/lib/util/text";
import { hypotheses, pairSignals, OVERLAP_METHOD_VERSION } from "@/lib/intelligence/overlap";
import { revisionChanges, snapshotChanges } from "@/lib/intelligence/changes";
import { METHODOLOGY_VERSION } from "@/lib/metrics/registry";
import { normalize } from "./normalize";
import { latestValidSnapshot, PUBLISHED_DIR, DATA_DIR, RESEARCH_DIR, readJson, writeJson } from "./store";
import { JOBS_FILE, PIPELINE_VERSION, initiativeUrls, parseGithub, readResult, type ArtifactResult, type DonationResult, type GithubResult, type WebsiteResult } from "./collect";
import { extractClaims, finalizeClaims, type ClaimDraft } from "./claims";
import { evidenceId, httpEvidence, officialEvidence, profileEvidence, proposalEvidence, pullEvidence, repoEvidence, txEvidence } from "./evidence";
import { loadJobs } from "./queue";
import { auditDataset } from "./audit";
import type { UrlCheck } from "./web";
import type { PullFacts, RepoFacts } from "./github";
import type { TxCheck } from "./onchain";

export const DATASET_FILE = path.join(PUBLISHED_DIR, "dataset.json");
export const EXPECTED = 55;

export interface CuratedFinding {
  initiativeIds: string[];
  organizationId?: string;
  assertion: string;
  status: EvidenceStatus;
  sourceUrls: string[];
  method: string;
  limitations: string[];
  researchedAt: string;
  researcher: string;
}

export async function publish(opts: { log?: (m: string) => void; dryRun?: boolean } = {}): Promise<{ dataset: Dataset; problems: string[] }> {
  const log = opts.log ?? console.log;
  const now = new Date().toISOString();
  const manifest = await latestValidSnapshot();
  if (!manifest) throw new Error("No valid official snapshot");
  const layer = await normalize(manifest);
  const previous = await readJson<Dataset>(DATASET_FILE);
  const prevClaims = new Map((previous?.claims ?? []).map((c) => [c.id, c]));

  const evidence = new Map<string, Evidence>();
  const addEv = (e: Evidence) => evidence.set(e.id, e);
  const urlChecks = new Map<string, UrlCheck>();
  const repoFacts = new Map<string, RepoFacts>();
  const pulls = new Map<string, PullFacts>();
  const txChecks = new Map<string, TxCheck>();
  const owners = new Map<string, NonNullable<GithubResult["owners"][number]>>();
  const repoInitiatives = new Map<string, Set<string>>();

  for (const ini of layer.initiatives) {
    addEv(officialEvidence(ini));
    for (const s of ini.sections) addEv(proposalEvidence(ini, s.key));
    const web = await readResult<WebsiteResult>("websites", ini.id);
    for (const c of web?.checks ?? []) {
      urlChecks.set(c.url, c);
      addEv(httpEvidence(c));
    }
    const gh = await readResult<GithubResult>("github", ini.id);
    for (const r of gh?.repos ?? []) {
      const key = r.fullName.toLowerCase();
      repoFacts.set(key, r);
      repoInitiatives.set(key, new Set([...(repoInitiatives.get(key) ?? []), ini.id]));
      addEv(repoEvidence(r));
    }
    // Requested names may differ in case from canonical names; index both.
    for (const g of initiativeUrls(layer, ini.id).github) {
      if (!g.repo) continue;
      const req = `${g.owner}/${g.repo}`.toLowerCase();
      const found = (gh?.repos ?? []).find((r) => r.fullName.toLowerCase() === req) ?? (gh?.repos ?? []).find((r) => r.url.toLowerCase().endsWith(req));
      if (found) repoFacts.set(req, found);
    }
    for (const o of gh?.owners ?? []) {
      owners.set(o.login.toLowerCase(), o);
      addEv(profileEvidence(o, manifest.createdAt));
    }
    const art = await readResult<ArtifactResult>("milestone_artifacts", ini.id);
    for (const a of art?.artifacts ?? []) {
      if (a.pull) {
        pulls.set(a.url, a.pull);
        addEv(pullEvidence(a.pull));
      }
      if (a.http) {
        urlChecks.set(a.url, a.http);
        addEv(httpEvidence(a.http));
      }
    }
    const dn = await readResult<DonationResult>("donations_onchain", ini.id);
    for (const t of dn?.checks ?? []) {
      txChecks.set(t.txHash, t);
      addEv(txEvidence(t, ini.safeAddress));
    }
  }

  // Claims.
  const drafts: ClaimDraft[] = [];
  const integrations = [];
  const previousGrants = [];
  for (const ini of layer.initiatives) {
    const r = extractClaims({
      ini,
      milestones: layer.milestones.filter((m) => m.initiativeId === ini.id),
      pledges: layer.pledges.filter((p) => p.initiativeId === ini.id),
      donations: layer.donations.filter((d) => d.initiativeId === ini.id),
      urlChecks,
      repos: repoFacts,
      pulls,
      txChecks,
      owners,
      knownNames: [...new Set(layer.organizations.filter((o) => !o.anonymous).flatMap((o) => o.names))].filter((n) => n.toLowerCase() !== ini.recipientTeam?.toLowerCase()),
      now,
    });
    drafts.push(...r.claims);
    integrations.push(...r.integrations);
    previousGrants.push(...r.previousGrants);
  }

  // Curated findings (agent or human research with cited public sources).
  const curated = (await readJson<CuratedFinding[]>(path.join(DATA_DIR, "curated", "findings.json"))) ?? [];
  const slugToId = new Map(layer.initiatives.map((i) => [i.slug, i.id]));
  for (const f of curated) {
    const ids = f.initiativeIds.map((x) => slugToId.get(x) ?? x).filter((x) => layer.initiatives.some((i) => i.id === x));
    for (const id of ids) {
      const evIds = f.sourceUrls.map((u) => {
        const eid = stableId("ev", "curated", u);
        if (!evidence.has(eid)) {
          addEv({
            id: eid,
            kind: "curated_source",
            url: u,
            title: urlChecks.get(u)?.title ?? u,
            observedAt: f.researchedAt,
            facts: { researcher: f.researcher },
            excerpt: null,
            ok: true,
            provenance: { origin: "curated", sourceUrls: [u], retrievedAt: f.researchedAt, method: f.method, version: PIPELINE_VERSION },
          });
        }
        return eid;
      });
      drafts.push({
        initiativeId: id,
        key: `curated:${f.assertion.slice(0, 100)}`,
        kind: "curated_finding",
        assertion: f.assertion,
        origin: "curated",
        section: null,
        quote: null,
        sourceUrls: f.sourceUrls,
        evidenceIds: evIds,
        supportingEvidenceIds: ["independently_verified", "partially_supported"].includes(f.status) ? evIds : [],
        contradictingEvidenceIds: f.status === "contradicted" ? evIds : [],
        status: f.status,
        verificationMethod: f.method,
        limitations: f.limitations,
        material: true,
      });
    }
  }
  const claims: Claim[] = finalizeClaims(drafts, prevClaims, now);

  // Repositories.
  const repositories: Repository[] = [];
  const seenRepo = new Set<string>();
  for (const [key, r] of repoFacts) {
    const canon = r.fullName.toLowerCase();
    if (seenRepo.has(canon)) continue;
    seenRepo.add(canon);
    const iniIds = new Set([...(repoInitiatives.get(canon) ?? []), ...(repoInitiatives.get(key) ?? [])]);
    repositories.push({
      id: `repo_${slugify(r.fullName)}`,
      ...r,
      initiativeIds: [...iniIds].sort(),
      provenance: { origin: "external", sourceUrls: [r.url], retrievedAt: r.checkedAt, method: "GitHub REST API", version: PIPELINE_VERSION },
    });
  }
  repositories.sort((a, b) => a.fullName.localeCompare(b.fullName));

  // Organisations: attach website + GitHub profile observations.
  const organizations: Organization[] = layer.organizations.map((o) => {
    const site = o.website ? urlChecks.get(o.website) : undefined;
    const ghLogin = (o.github ?? (o.website ? parseGithub(o.website)?.owner : null))?.toLowerCase() ?? null;
    const prof = ghLogin ? owners.get(ghLogin) : undefined;
    const notes = curated
      .filter((f) => f.organizationId === o.id)
      .map((f) => ({ text: f.assertion, sourceUrls: f.sourceUrls, status: f.status, origin: "curated" as const }));
    return {
      ...o,
      description: site?.description ?? null,
      websiteCheck: site
        ? { url: site.url, status: site.status, finalUrl: site.finalUrl, title: site.title, description: site.description, checkedAt: site.checkedAt, ok: site.ok }
        : null,
      githubProfile: prof ? { login: prof.login, type: prof.type, name: prof.name, blog: prof.blog, createdAt: prof.createdAt, publicRepos: prof.publicRepos, url: prof.url } : null,
      github: o.github ?? prof?.login ?? null,
      notes,
    };
  });

  // Products: the recipient's own website and same-domain pages cited as prior work.
  const products: Product[] = [];
  for (const ini of layer.initiatives) {
    const org = organizations.find((o) => o.id === ini.organizationId);
    const domains = new Set([identityDomain(ini.recipientUrl), ...(org?.website ? [identityDomain(org.website)] : [])].filter((d): d is string => !!d && !d.startsWith("github.com")));
    const cand = new Map<string, string>();
    if (ini.recipientUrl && !parseGithub(ini.recipientUrl)) cand.set(ini.recipientUrl, ini.recipientTeam ?? ini.shortTitle);
    for (const l of ini.textLinks) {
      const d = identityDomain(l.url);
      if (d && domains.has(d) && !parseGithub(l.url)) cand.set(l.url, l.text ?? new URL(l.url).hostname);
    }
    for (const [url, name] of cand) {
      const c = urlChecks.get(url);
      const host = (() => {
        try {
          return new URL(url).hostname;
        } catch {
          return "";
        }
      })();
      // Kind comes only from literal URL structure; no guessing from content.
      const kind: Product["kind"] = /^docs?\./.test(host) || /^\/docs?(\/|$)/.test(new URL(url).pathname) ? "docs" : /^app\./.test(host) ? "app" : "website";
      const id = stableId("prod", url);
      const existing = products.find((p) => p.id === id);
      if (existing) {
        existing.initiativeIds = [...new Set([...existing.initiativeIds, ini.id])];
        continue;
      }
      products.push({
        id,
        name: name.slice(0, 120),
        url,
        initiativeIds: [ini.id],
        kind,
        reachable: c ? (c.inconclusive ? null : c.ok) : null,
        status: c?.status ?? null,
        title: c?.title ?? null,
        checkedAt: c?.checkedAt ?? null,
        provenance: { origin: "external", sourceUrls: [url], retrievedAt: c?.checkedAt ?? now, method: "Recipient-domain link + HTTP check", version: PIPELINE_VERSION },
      });
    }
  }

  // Relationships.
  const rels = new Map<string, Relationship>();
  const rel = (r: Omit<Relationship, "id">) => {
    const id = stableId("rel", r.from.type, r.from.id, r.type, r.to.type, r.to.id);
    if (!rels.has(id)) rels.set(id, { id, ...r });
  };
  for (const p of layer.pledges) {
    if (!p.backerId) continue;
    rel({ from: { type: "backer", id: p.backerId }, to: { type: "initiative", id: p.initiativeId }, type: "funds", confidence: "confirmed", reason: `Official pledge record (${p.status})`, evidenceIds: [evidenceId.official(p.initiativeId)], sourceUrls: p.provenance.sourceUrls });
  }
  for (const ini of layer.initiatives) {
    if (ini.organizationId)
      rel({ from: { type: "organization", id: ini.organizationId }, to: { type: "initiative", id: ini.id }, type: "proposes", confidence: "confirmed", reason: "Official recipient team", evidenceIds: [evidenceId.official(ini.id)], sourceUrls: [ini.url] });
    for (const st of ini.stages)
      rel({ from: { type: "initiative", id: ini.id }, to: { type: "problem", id: st.stage }, type: "addresses", confidence: "inferred", reason: `Rule-based classification (terms: ${st.matchedTerms.slice(0, 5).join(", ")})`, evidenceIds: [], sourceUrls: [] });
    for (const sd of ini.standards) {
      const inMilestone = layer.milestones.some((m) => m.initiativeId === ini.id && [m.name, ...m.criteria].join(" ").toUpperCase().includes(sd));
      rel({ from: { type: "initiative", id: ini.id }, to: { type: "standard", id: sd }, type: inMilestone ? "depends_on" : "references", confidence: "stated", reason: inMilestone ? `${sd} appears in milestone deliverables` : `${sd} is referenced in the proposal`, evidenceIds: [], sourceUrls: [ini.url] });
    }
    for (const g of initiativeUrls(layer, ini.id).github) {
      if (!g.repo) continue;
      const r = repoFacts.get(`${g.owner}/${g.repo}`.toLowerCase());
      if (!r?.exists) continue;
      const repoId = `repo_${slugify(r.fullName)}`;
      rel({ from: { type: "initiative", id: ini.id }, to: { type: "repository", id: repoId }, type: "references", confidence: "stated", reason: "Repository cited in the proposal", evidenceIds: [evidenceId.repo(r.fullName)], sourceUrls: [ini.url, r.url] });
      const org = organizations.find((o) => o.id === ini.organizationId);
      const ownerLc = r.fullName.split("/")[0]?.toLowerCase();
      if (org && ownerLc && (org.github?.toLowerCase() === ownerLc || parseGithub(ini.recipientUrl ?? "")?.owner.toLowerCase() === ownerLc))
        rel({ from: { type: "organization", id: org.id }, to: { type: "repository", id: repoId }, type: "maintains", confidence: "confirmed", reason: "Repository owner matches the recipient's official GitHub link", evidenceIds: [evidenceId.repo(r.fullName)], sourceUrls: [r.url] });
    }
    for (const prod of products.filter((p) => p.initiativeIds.includes(ini.id)))
      if (ini.organizationId)
        rel({ from: { type: "organization", id: ini.organizationId }, to: { type: "product", id: prod.id }, type: "develops", confidence: prod.reachable ? "confirmed" : "stated", reason: "Website on the recipient's official domain", evidenceIds: [evidenceId.http(prod.url)], sourceUrls: [prod.url] });
  }
  for (const person of layer.people)
    for (const iid of person.initiativeIds)
      rel({ from: { type: "person", id: person.id }, to: { type: "initiative", id: iid }, type: "develops", confidence: person.role?.startsWith("Milestone reviewer") ? "confirmed" : "stated", reason: person.role ?? "Named in the team section with a public profile", evidenceIds: [], sourceUrls: person.provenance.sourceUrls });
  const byId = new Map(layer.initiatives.map((i) => [i.id, i]));
  const hyps = hypotheses(pairSignals(layer.initiatives, layer.milestones, layer.pledges), byId);
  for (const h of hyps)
    rel({ from: { type: "initiative", id: h.a }, to: { type: "initiative", id: h.b }, type: h.kind, confidence: "inferred", reason: `${OVERLAP_METHOD_VERSION}: ${h.reasons.join("; ")}`, evidenceIds: [], sourceUrls: [] });

  // Changes: carry forward history, add snapshot diff and official revision history.
  const snapshotId = manifest.snapshotId;
  const partial = { snapshotId, initiatives: layer.initiatives, milestones: layer.milestones, pledges: layer.pledges, claims };
  const changes = new Map((previous?.changes ?? []).map((c) => [c.id, c]));
  if (previous && previous.meta.snapshotId !== snapshotId) for (const c of snapshotChanges({ ...previous, snapshotId: previous.meta.snapshotId }, partial, now)) changes.set(c.id, c);
  for (const c of revisionChanges(layer.revisions)) changes.set(c.id, c);

  const research = await readJson<{ startedAt: string; finishedAt: string; pipelineVersion: string; requests: number; failures: number }>(path.join(RESEARCH_DIR, "last-run.json"));
  const jobs = await loadJobs(JOBS_FILE);

  const body = {
    initiatives: layer.initiatives,
    milestones: layer.milestones,
    pledges: layer.pledges,
    donations: layer.donations,
    organizations,
    aliases: layer.aliases,
    people: layer.people,
    repositories,
    products,
    integrations,
    previousGrants,
    securityProblems: SECURITY_PROBLEMS,
    claims,
    evidence: [...evidence.values()].sort((a, b) => a.id.localeCompare(b.id)),
    relationships: [...rels.values()],
    revisions: layer.revisions,
    changes: [...changes.values()].sort((a, b) => b.detectedAt.localeCompare(a.detectedAt)),
    researchJobs: jobs,
  };
  const hash = contentHash({ ...body, researchJobs: undefined, changes: undefined });
  const dataset: Dataset = {
    meta: {
      datasetVersion: `${snapshotId}+${hash.slice(0, 8)}`,
      generatedAt: now,
      officialGeneratedAt: manifest.officialGeneratedAt,
      officialSourceUrl: "https://initiatives.thedao.fund/api/initiatives.json?status=ballot",
      methodologyVersion: METHODOLOGY_VERSION,
      cohort: {
        frozenAt: (await readJson<{ frozenAt: string }>(path.join(DATA_DIR, "cohort.json")))?.frozenAt ?? manifest.createdAt,
        size: layer.initiatives.length,
        ids: layer.initiatives.map((i) => i.id),
        slugs: layer.initiatives.map((i) => i.slug),
      },
      ingestion: { startedAt: manifest.createdAt, finishedAt: manifest.createdAt, requests: manifest.requests, failedRequests: manifest.failedRequests, validation: manifest.validation },
      research: research ?? null,
      snapshotId,
      previousSnapshotId: previous?.meta.snapshotId ?? null,
      contentHash: hash,
    },
    ...body,
  };

  const problems = validateDataset(dataset);
  const audit = await auditDataset(dataset, manifest);
  problems.push(...audit.failures.slice(0, 50));
  log(`Truth audit: ${audit.checked} checks, ${audit.failures.length} failures`);
  if (!opts.dryRun) await writeJson(path.join(PUBLISHED_DIR, "audit.json"), { datasetVersion: dataset.meta.datasetVersion, at: now, ...audit });
  if (problems.length) {
    log(`Publish refused: ${problems.length} problem(s)`);
    for (const p of problems) log(`  - ${p}`);
    return { dataset, problems };
  }
  if (!opts.dryRun) await writeJson(DATASET_FILE, dataset, false);
  log(
    `Published ${dataset.meta.datasetVersion}: ${dataset.initiatives.length} initiatives, ${claims.length} claims, ${dataset.evidence.length} evidence, ${repositories.length} repos, ${organizations.length} organisations, ${dataset.relationships.length} relationships, ${dataset.changes.length} changes`,
  );
  return { dataset, problems };
}

/** Invariants a dataset must satisfy before it can replace the published one. */
export function validateDataset(d: Dataset, expected = EXPECTED): string[] {
  const problems: string[] = [];
  const parsed = DatasetSchema.safeParse(d);
  if (!parsed.success) problems.push(...parsed.error.issues.slice(0, 10).map((i) => `schema: ${i.path.join(".")}: ${i.message}`));
  if (d.initiatives.length !== expected) problems.push(`expected ${expected} cohort initiatives, found ${d.initiatives.length}`);
  if (new Set(d.initiatives.map((i) => i.id)).size !== d.initiatives.length) problems.push("duplicate initiative ids");
  if (new Set(d.initiatives.map((i) => i.slug)).size !== d.initiatives.length) problems.push("duplicate initiative slugs");
  for (const i of d.initiatives) {
    const ms = d.milestones.filter((m) => m.initiativeId === i.id);
    if (ms.length === 0) problems.push(`${i.slug}: no milestones`);
    const sum = ms.reduce((s, m) => s + m.amountCents, 0);
    if (sum !== i.funding.goalCents) problems.push(`${i.slug}: milestone sum ${sum} ≠ goal ${i.funding.goalCents}`);
    if (i.funding.pledgedCents + i.funding.donatedCents !== i.funding.officialRaisedCents) problems.push(`${i.slug}: pledged + donated ≠ official raised`);
  }
  const ids = new Set(d.claims.map((c) => c.id));
  if (ids.size !== d.claims.length) problems.push("duplicate claim ids");
  const evIds = new Set(d.evidence.map((e) => e.id));
  for (const c of d.claims) for (const e of c.supportingEvidenceIds) if (!evIds.has(e)) problems.push(`claim ${c.id} references missing evidence ${e}`);
  return problems.slice(0, 50);
}
