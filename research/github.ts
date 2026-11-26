/**
 * Minimal GitHub REST client for the research pipeline. Uses GITHUB_TOKEN when set,
 * otherwise falls back to an authenticated `gh` CLI if available, otherwise anonymous
 * requests (60/hour). Responses are cached on disk for the research TTL.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fetchWithRetry } from "@/lib/util/http";
import { sha256 } from "@/lib/util/hash";
import { RESEARCH_DIR, readJson, writeJson } from "./store";

const exec = promisify(execFile);
const CACHE_DIR = path.join(RESEARCH_DIR, "cache", "github");
const TTL_MS = Number(process.env.RESEARCH_TTL_HOURS ?? 72) * 3600_000;

export interface GhResult<T> {
  status: number;
  body: T | null;
  fetchedAt: string;
  link: string | null;
}

let ghAvailable: boolean | null = null;
async function hasGhCli(): Promise<boolean> {
  if (ghAvailable !== null) return ghAvailable;
  try {
    await exec("gh", ["api", "rate_limit", "--jq", ".rate.remaining"], { timeout: 15_000 });
    ghAvailable = true;
  } catch {
    ghAvailable = false;
  }
  return ghAvailable;
}

export let githubRequests = 0;

export async function gh<T = unknown>(endpoint: string, opts: { cache?: boolean } = {}): Promise<GhResult<T>> {
  const key = sha256(endpoint);
  const file = path.join(CACHE_DIR, `${key}.json`);
  if (opts.cache !== false) {
    const cached = await readJson<GhResult<T> & { endpoint: string }>(file);
    if (cached && Date.now() - Date.parse(cached.fetchedAt) < TTL_MS) return cached;
  }
  githubRequests++;
  const fetchedAt = new Date().toISOString();
  let result: GhResult<T>;
  const token = process.env.GITHUB_TOKEN;
  if (!token && (await hasGhCli())) {
    try {
      const { stdout } = await exec("gh", ["api", "-i", endpoint], { timeout: 30_000, maxBuffer: 20 * 1024 * 1024 });
      const split = stdout.indexOf("\r\n\r\n") >= 0 ? stdout.indexOf("\r\n\r\n") : stdout.indexOf("\n\n");
      const head = stdout.slice(0, split);
      const status = Number(/HTTP\/[\d.]+\s+(\d{3})/.exec(head)?.[1] ?? 200);
      const link = /^link:\s*(.+)$/im.exec(head)?.[1]?.trim() ?? null;
      const bodyText = stdout.slice(split).trim();
      result = { status, body: bodyText ? (JSON.parse(bodyText) as T) : null, fetchedAt, link };
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string };
      const out = `${e.stdout ?? ""}`;
      const status = Number(/HTTP\/[\d.]+\s+(\d{3})/.exec(out)?.[1] ?? (/(Not Found|404)/.test(`${e.stderr}`) ? 404 : 0));
      result = { status: status || 599, body: null, fetchedAt, link: null };
    }
  } else {
    const res = await fetchWithRetry(`https://api.github.com/${endpoint.replace(/^\//, "")}`, {
      headers: { accept: "application/vnd.github+json", ...(token ? { authorization: `Bearer ${token}` } : {}), "x-github-api-version": "2022-11-28" },
      retries: 2,
    });
    const text = await res.text();
    let body: T | null = null;
    try {
      body = text ? (JSON.parse(text) as T) : null;
    } catch {
      body = null;
    }
    result = { status: res.status, body: res.ok ? body : null, fetchedAt, link: res.headers.get("link") };
  }
  if (result.status < 500) await writeJson(file, { ...result, endpoint }, false);
  return result;
}

interface RepoApi {
  full_name: string;
  html_url: string;
  description: string | null;
  license: { spdx_id: string | null } | null;
  archived: boolean;
  fork: boolean;
  default_branch: string;
  created_at: string;
  pushed_at: string;
  stargazers_count: number;
  open_issues_count: number;
  language: string | null;
  topics?: string[];
}

export interface RepoFacts {
  fullName: string;
  url: string;
  exists: boolean;
  description: string | null;
  license: string | null;
  archived: boolean | null;
  fork: boolean | null;
  defaultBranch: string | null;
  createdAt: string | null;
  pushedAt: string | null;
  stars: number | null;
  openIssues: number | null;
  language: string | null;
  topics: string[];
  latestRelease: { tag: string; publishedAt: string | null; url: string } | null;
  releaseCount: number | null;
  hasCiWorkflows: boolean | null;
  hasTestsDir: boolean | null;
  hasSecurityPolicy: boolean | null;
  hasReadme: boolean | null;
  commitsLast90d: number | null;
  contributorsSampled: number | null;
  checkedAt: string;
  error: string | null;
}

export async function repoFacts(fullName: string, now = new Date()): Promise<RepoFacts> {
  const checkedAt = now.toISOString();
  const empty: RepoFacts = {
    fullName,
    url: `https://github.com/${fullName}`,
    exists: false,
    description: null,
    license: null,
    archived: null,
    fork: null,
    defaultBranch: null,
    createdAt: null,
    pushedAt: null,
    stars: null,
    openIssues: null,
    language: null,
    topics: [],
    latestRelease: null,
    releaseCount: null,
    hasCiWorkflows: null,
    hasTestsDir: null,
    hasSecurityPolicy: null,
    hasReadme: null,
    commitsLast90d: null,
    contributorsSampled: null,
    checkedAt,
    error: null,
  };
  const r = await gh<RepoApi>(`repos/${fullName}`);
  if (r.status === 404) return { ...empty, error: "Repository not found or private (HTTP 404)" };
  if (!r.body) return { ...empty, error: `GitHub API status ${r.status}` };
  const repo = r.body;
  const [releases, root, workflows, commits, contributors] = await Promise.all([
    gh<{ tag_name: string; published_at: string | null; html_url: string; draft: boolean }[]>(`repos/${repo.full_name}/releases?per_page=100`),
    gh<{ name: string; type: string }[]>(`repos/${repo.full_name}/contents/`),
    gh<{ total_count: number }>(`repos/${repo.full_name}/actions/workflows?per_page=1`),
    gh<unknown[]>(`repos/${repo.full_name}/commits?per_page=100&since=${new Date(now.getTime() - 90 * 86400_000).toISOString().slice(0, 10)}T00:00:00Z`),
    gh<unknown[]>(`repos/${repo.full_name}/contributors?per_page=100&anon=0`),
  ]);
  const rel = (releases.body ?? []).filter((x) => !x.draft);
  const names = (root.body ?? []).map((x) => x.name.toLowerCase());
  return {
    ...empty,
    fullName: repo.full_name,
    url: repo.html_url,
    exists: true,
    description: repo.description,
    license: repo.license?.spdx_id && repo.license.spdx_id !== "NOASSERTION" ? repo.license.spdx_id : repo.license ? "Other/unrecognised" : null,
    archived: repo.archived,
    fork: repo.fork,
    defaultBranch: repo.default_branch,
    createdAt: repo.created_at,
    pushedAt: repo.pushed_at,
    stars: repo.stargazers_count,
    openIssues: repo.open_issues_count,
    language: repo.language,
    topics: repo.topics ?? [],
    latestRelease: rel[0] ? { tag: rel[0].tag_name, publishedAt: rel[0].published_at, url: rel[0].html_url } : null,
    releaseCount: releases.body ? rel.length : null,
    hasCiWorkflows: workflows.body ? workflows.body.total_count > 0 : null,
    hasTestsDir: root.body ? names.some((n) => /^(test|tests|__tests__|spec|specs|test_suite|testdata|e2e)$/.test(n)) : null,
    hasSecurityPolicy: root.body ? names.includes("security.md") : null,
    hasReadme: root.body ? names.some((n) => n.startsWith("readme")) : null,
    commitsLast90d: commits.body ? commits.body.length : null,
    contributorsSampled: contributors.body ? contributors.body.length : null,
  };
}

export interface PullFacts {
  url: string;
  exists: boolean;
  state: string | null;
  merged: boolean | null;
  mergedAt: string | null;
  title: string | null;
  author: string | null;
  checkedAt: string;
}

export async function pullFacts(owner: string, repo: string, n: number): Promise<PullFacts> {
  const r = await gh<{ state: string; merged: boolean; merged_at: string | null; title: string; user: { login: string } | null; html_url: string }>(
    `repos/${owner}/${repo}/pulls/${n}`,
  );
  const base = { url: `https://github.com/${owner}/${repo}/pull/${n}`, checkedAt: r.fetchedAt };
  if (!r.body) return { ...base, exists: false, state: null, merged: null, mergedAt: null, title: null, author: null };
  return { ...base, exists: true, state: r.body.state, merged: r.body.merged, mergedAt: r.body.merged_at, title: r.body.title, author: r.body.user?.login ?? null };
}

export async function ownerFacts(login: string) {
  const r = await gh<{ login: string; type: string; name: string | null; blog: string | null; created_at: string; public_repos: number; html_url: string }>(`users/${login}`);
  if (!r.body) return null;
  return {
    login: r.body.login,
    type: r.body.type,
    name: r.body.name,
    blog: r.body.blog || null,
    createdAt: r.body.created_at,
    publicRepos: r.body.public_repos,
    url: r.body.html_url,
  };
}
