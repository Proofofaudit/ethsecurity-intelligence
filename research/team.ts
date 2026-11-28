/**
 * Machine collection for Items 15 and 16: public GitHub facts for every person handle and every
 * GitHub owner that an initiative links. Handles come only from curated team records and from
 * profile links published in the proposal; nothing is guessed.
 *
 * Commit counts (documented method): for each person handle, commits authored by that GitHub login
 * (GET /repos/{o}/{r}/commits?author=<login>&since=<start of the 12-month window>), counted per UTC
 * month, summed over (a) the person's own non-fork repositories pushed inside the window and
 * (b) non-fork repositories of the owners the initiative links, pushed inside the window. At most
 * MAX_REPOS_PER_PERSON repositories per person, at most MAX_PAGES pages of 100 commits per repository
 * (a capped repository is flagged and its count is a lower bound), and at most `maxRequests` GitHub
 * requests per initiative (cached responses do not count). 202, 429 and 5xx responses are retried.
 * Results are written to data/research/team/<initiativeId>.json.
 */
import path from "node:path";
import { authorCommitDates, githubRequests, latestReleaseDate, ownedRepos, ownerFacts, type OwnedRepo } from "./github";
import { parseGithub } from "./collect";
import { RESEARCH_DIR, readJson, writeJson } from "./store";
import type { CuratedTeamRecord } from "@/lib/research-v2/schemas";

export const TEAM_RESEARCH_DIR = path.join(RESEARCH_DIR, "team");
export const MAX_REPOS_PER_OWNER = 12;
export const MAX_REPOS_PER_PERSON = 10;
export const MAX_PAGES = 3;
export const DEFAULT_MAX_REQUESTS = 200;

export interface OwnerResult {
  login: string;
  type: string | null;
  url: string;
  source: "curated" | "proposal";
  reposTotal: number | null;
  repos: (OwnedRepo & { latestReleaseAt: string | null })[];
}
export interface PersonCommits {
  handle: string;
  url: string;
  source: "curated" | "proposal";
  repos: { fullName: string; monthly: number[]; capped: boolean }[];
  /** Sum of repos[].monthly, oldest month first. Empty when the handle is not a user account or nothing could be read. */
  monthly: number[];
}
export interface TeamMachineResult {
  initiativeId: string;
  collectedAt: string;
  months: string[];
  since: string;
  method: string;
  maxRequests: number;
  requests: number;
  truncated: boolean;
  owners: OwnerResult[];
  people: PersonCommits[];
}

export interface TargetInput {
  linkUrls: string[];
  profileUrls: string[];
  curated: CuratedTeamRecord | null;
}
export interface Targets {
  people: { handle: string; url: string; source: "curated" | "proposal" }[];
  owners: { login: string; url: string; source: "curated" | "proposal" }[];
}

/** The 12 UTC months ending with the month of `now`, oldest first, as YYYY-MM. */
export function monthWindow(now: Date): string[] {
  const out: string[] = [];
  for (let k = 11; k >= 0; k--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/** Counts ISO timestamps per month of the window; timestamps outside the window are ignored. */
export function bucketCommits(dates: string[], months: string[]): number[] {
  const out = months.map(() => 0);
  for (const d of dates) {
    const i = months.indexOf(d.slice(0, 7));
    if (i >= 0) out[i]!++;
  }
  return out;
}

export const sumMonthly = (rows: number[][]): number[] => (rows.length ? rows[0]!.map((_, i) => rows.reduce((s, r) => s + (r[i] ?? 0), 0)) : []);

/** GitHub people and owners to look up. Only curated handles, proposal profile links and proposal links count. */
export function githubTargets(input: TargetInput): Targets {
  const people = new Map<string, Targets["people"][number]>();
  const owners = new Map<string, Targets["owners"][number]>();
  const addPerson = (url: string, source: "curated" | "proposal") => {
    const g = parseGithub(url);
    if (!g || g.repo) return;
    const k = g.owner.toLowerCase();
    if (!people.has(k)) people.set(k, { handle: g.owner, url: `https://github.com/${g.owner}`, source });
  };
  const addOwner = (url: string, source: "curated" | "proposal") => {
    const g = parseGithub(url);
    if (!g) return;
    const k = g.owner.toLowerCase();
    if (!owners.has(k)) owners.set(k, { login: g.owner, url: `https://github.com/${g.owner}`, source });
  };
  for (const m of input.curated?.members ?? []) for (const h of m.handles) if (h.platform.toLowerCase() === "github") addPerson(h.url, "curated");
  for (const u of input.profileUrls) addPerson(u, "proposal");
  for (const u of input.linkUrls) addOwner(u, "proposal");
  for (const p of people.values()) addOwner(p.url, p.source);
  return { people: [...people.values()], owners: [...owners.values()] };
}

export async function collectTeamGithub(
  initiativeId: string,
  targets: Targets,
  opts: { now?: Date; maxRequests?: number } = {},
): Promise<TeamMachineResult> {
  const now = opts.now ?? new Date();
  const maxRequests = opts.maxRequests ?? DEFAULT_MAX_REQUESTS;
  const months = monthWindow(now);
  const since = `${months[0]}-01T00:00:00Z`;
  const startRequests = githubRequests;
  const spent = () => githubRequests - startRequests;
  let truncated = false;
  const budget = () => {
    if (spent() >= maxRequests) truncated = true;
    return !truncated;
  };

  const owners: OwnerResult[] = [];
  for (const o of targets.owners) {
    if (!budget()) break;
    const facts = await ownerFacts(o.login);
    const all = budget() ? await ownedRepos(o.login) : null;
    const repos: OwnerResult["repos"] = [];
    for (const r of (all ?? []).slice(0, MAX_REPOS_PER_OWNER)) {
      repos.push({ ...r, latestReleaseAt: budget() ? await latestReleaseDate(r.fullName) : null });
    }
    owners.push({ login: facts?.login ?? o.login, type: facts?.type ?? null, url: facts?.url ?? o.url, source: o.source, reposTotal: all ? all.length : null, repos });
  }

  const inWindow = (r: OwnedRepo) => !r.fork && !!r.pushedAt && r.pushedAt >= since;
  const people: PersonCommits[] = [];
  for (const p of targets.people) {
    const own = owners.find((o) => o.login.toLowerCase() === p.handle.toLowerCase());
    const entry: PersonCommits = { handle: p.handle, url: p.url, source: p.source, repos: [], monthly: [] };
    people.push(entry);
    if (!own || own.type !== "User") continue;
    const candidates = [
      ...own.repos.filter(inWindow),
      ...owners.filter((o) => o !== own && o.type === "Organization").flatMap((o) => o.repos.filter(inWindow)),
    ].slice(0, MAX_REPOS_PER_PERSON);
    for (const r of candidates) {
      if (!budget()) break;
      const res = await authorCommitDates(r.fullName, p.handle, since, MAX_PAGES);
      if (!res.ok) continue;
      entry.repos.push({ fullName: r.fullName, monthly: bucketCommits(res.dates, months), capped: res.capped });
    }
    // A user with no repositories in the window gets twelve zeros, because the lookup succeeded.
    if (entry.repos.length) entry.monthly = sumMonthly(entry.repos.map((x) => x.monthly));
    else if (candidates.length === 0 && !truncated) entry.monthly = months.map(() => 0);
  }

  return {
    initiativeId,
    collectedAt: now.toISOString(),
    months,
    since,
    method:
      "Commits authored by the GitHub login (commits API, author filter), counted per UTC month over the person's own non-fork repositories and the linked organization's non-fork repositories pushed in the window. Up to 10 repositories per person and 3 pages of 100 commits per repository; capped repositories are lower bounds.",
    maxRequests,
    requests: spent(),
    truncated,
    owners,
    people,
  };
}

export async function writeTeamMachineResult(r: TeamMachineResult): Promise<string> {
  const file = path.join(TEAM_RESEARCH_DIR, `${r.initiativeId}.json`);
  await writeJson(file, r);
  return file;
}

export async function readTeamMachineResult(initiativeId: string, dir = TEAM_RESEARCH_DIR): Promise<TeamMachineResult | null> {
  return readJson<TeamMachineResult>(path.join(dir, `${initiativeId}.json`));
}
