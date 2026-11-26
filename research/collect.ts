/**
 * Research collection: for every cohort initiative, gather public external evidence.
 * Tasks: websites (HTTP checks), github (repositories, owners), milestone_artifacts
 * (linked PRs and pages), donations_onchain (transaction receipts).
 * Results are written per initiative under data/research/results/<task>/<initiativeId>.json.
 */
import path from "node:path";
import type { OfficialLayer } from "./normalize";
import { runQueue, type JobSpec } from "./queue";
import { checkUrl, webRequests, type UrlCheck } from "./web";
import { githubRequests, ownerFacts, pullFacts, repoFacts, type PullFacts, type RepoFacts } from "./github";
import { checkTransactions, rpcRequests, type TxCheck } from "./onchain";
import { RESEARCH_DIR, readJson, writeJson } from "./store";
import { contentHash } from "@/lib/util/hash";
import { mapLimit } from "@/lib/util/http";

export const PIPELINE_VERSION = "research@1";
export const RESULTS_DIR = path.join(RESEARCH_DIR, "results");
export const JOBS_FILE = path.join(RESEARCH_DIR, "jobs.json");

const SOCIAL = /^https?:\/\/(www\.)?(x\.com|twitter\.com|t\.me|discord\.(gg|com)|youtube\.com|youtu\.be|linkedin\.com|warpcast\.com|farcaster\.xyz)\//i;

export interface GithubRef {
  owner: string;
  repo: string | null;
  pull: number | null;
  url: string;
}

export function parseGithub(url: string): GithubRef | null {
  const m = /^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9-]{1,39})(?:\/([A-Za-z0-9._-]{1,100}))?(?:\/(pull|pulls)\/(\d+))?/i.exec(url);
  if (!m) return null;
  const owner = m[1] as string;
  if (["orgs", "sponsors", "features", "topics", "search", "marketplace", "settings", "about", "advisories", "apps", "collections", "enterprise"].includes(owner.toLowerCase())) return null;
  const repo = m[2] ? m[2].replace(/\.git$/, "") : null;
  return { owner, repo, pull: m[4] ? Number(m[4]) : null, url };
}

export interface WebsiteResult {
  checks: UrlCheck[];
}
export interface GithubResult {
  repos: RepoFacts[];
  owners: NonNullable<Awaited<ReturnType<typeof ownerFacts>>>[];
}
export interface ArtifactResult {
  artifacts: { milestoneIndex: number; url: string; pull: PullFacts | null; http: UrlCheck | null }[];
}
export interface DonationResult {
  checks: TxCheck[];
}

export function resultFile(task: string, initiativeId: string) {
  return path.join(RESULTS_DIR, task, `${initiativeId}.json`);
}

export async function readResult<T>(task: string, initiativeId: string): Promise<T | null> {
  return readJson<T>(resultFile(task, initiativeId));
}

export function initiativeUrls(layer: OfficialLayer, initiativeId: string) {
  const ini = layer.initiatives.find((i) => i.id === initiativeId);
  if (!ini) return { web: [], github: [] as GithubRef[] };
  const urls = new Set<string>();
  if (ini.recipientUrl) urls.add(ini.recipientUrl);
  for (const l of ini.links) for (const part of l.split(/\s+/)) if (/^https?:\/\//.test(part)) urls.add(part);
  for (const l of ini.textLinks) if (!l.section.startsWith("milestone:")) urls.add(l.url);
  for (const p of layer.pledges.filter((x) => x.initiativeId === initiativeId)) if (p.url) urls.add(p.url);
  const github: GithubRef[] = [];
  const web: string[] = [];
  for (const u of urls) {
    const g = parseGithub(u);
    if (g) github.push(g);
    else if (!SOCIAL.test(u) && !u.startsWith("https://initiatives.thedao.fund")) web.push(u);
  }
  return { web: [...new Set(web)].sort(), github };
}

export async function collect(layer: OfficialLayer, opts: { log?: (m: string) => void; tasks?: string[] } = {}) {
  const log = opts.log ?? console.log;
  const startedAt = new Date().toISOString();
  const tasks = new Set(opts.tasks ?? ["websites", "github", "milestone_artifacts", "donations_onchain"]);
  const specs: JobSpec[] = [];

  for (const ini of layer.initiatives) {
    const { web, github } = initiativeUrls(layer, ini.id);
    if (tasks.has("websites"))
      specs.push({
        initiativeId: ini.id,
        task: "websites",
        inputHash: contentHash(web),
        run: async () => {
          const checks = await mapLimit(web, 4, (u) => checkUrl(u));
          await writeJson(resultFile("websites", ini.id), { checks } satisfies WebsiteResult);
          return checks.length;
        },
      });
    if (tasks.has("github")) {
      const repoNames = [...new Set(github.filter((g) => g.repo).map((g) => `${g.owner}/${g.repo}`))].sort();
      const owners = [...new Set(github.map((g) => g.owner.toLowerCase()))].sort();
      specs.push({
        initiativeId: ini.id,
        task: "github",
        inputHash: contentHash({ repoNames, owners }),
        run: async () => {
          const repos = await mapLimit(repoNames, 2, (r) => repoFacts(r));
          const ownerRows = (await mapLimit(owners, 2, (o) => ownerFacts(o))).filter((x): x is NonNullable<typeof x> => !!x);
          await writeJson(resultFile("github", ini.id), { repos, owners: ownerRows } satisfies GithubResult);
          return repos.length + ownerRows.length;
        },
      });
    }
    if (tasks.has("milestone_artifacts")) {
      const ms = layer.milestones.filter((m) => m.initiativeId === ini.id && m.link);
      specs.push({
        initiativeId: ini.id,
        task: "milestone_artifacts",
        inputHash: contentHash(ms.map((m) => [m.index, m.link])),
        run: async () => {
          const artifacts: ArtifactResult["artifacts"] = [];
          for (const m of ms) {
            const g = parseGithub(m.link as string);
            if (g?.repo && g.pull) artifacts.push({ milestoneIndex: m.index, url: m.link as string, pull: await pullFacts(g.owner, g.repo, g.pull), http: null });
            else artifacts.push({ milestoneIndex: m.index, url: m.link as string, pull: null, http: await checkUrl(m.link as string) });
          }
          await writeJson(resultFile("milestone_artifacts", ini.id), { artifacts } satisfies ArtifactResult);
          return artifacts.length;
        },
      });
    }
    if (tasks.has("donations_onchain")) {
      const dns = layer.donations.filter((d) => d.initiativeId === ini.id);
      specs.push({
        initiativeId: ini.id,
        task: "donations_onchain",
        inputHash: contentHash({ v: "onchain@4", tx: dns.map((d) => d.txHash).sort() }),
        run: async () => {
          const res = await checkTransactions(dns.map((d) => ({ txHash: d.txHash, safe: ini.safeAddress })));
          const checks = [...res.values()];
          await writeJson(resultFile("donations_onchain", ini.id), { checks } satisfies DonationResult);
          return checks.length;
        },
      });
    }
  }

  const jobs = await runQueue(specs, { file: JOBS_FILE, concurrency: 3, log });
  const finishedAt = new Date().toISOString();
  const summary = {
    startedAt,
    finishedAt,
    pipelineVersion: PIPELINE_VERSION,
    requests: webRequests + githubRequests + rpcRequests,
    failures: jobs.filter((j) => j.state === "failed").length,
  };
  await writeJson(path.join(RESEARCH_DIR, "last-run.json"), summary);
  log(`Research finished: ${jobs.filter((j) => j.state === "succeeded").length} succeeded, ${summary.failures} failed, ${summary.requests} requests`);
  return { jobs, summary };
}
