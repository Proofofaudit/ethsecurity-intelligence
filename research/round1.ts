/**
 * Round 1 collector and parsers (TheDAO / Giveth Ethereum Security QF round).
 *
 * Retrieval (no public dataset or API publishes the per-project results):
 *  - https://thedao.fund/transparency: server-rendered HTML with the "Who we funded" table and
 *    the page totals. The page's route module (/assets/route-<hash>.js, imported by the inline
 *    module script) embeds the report's round1.csv as a template literal; the site itself
 *    requires its header and exactly 135 rows. The hashed bundle is not a stable API.
 *  - https://forum.giveth.io/t/2201.json: Discourse JSON of the results topic (round-level facts).
 * Raw responses are stored content-addressed under data/external/round1/ with a manifest, so the
 * truth audit re-parses them offline. A failed fetch keeps the previous copy and marks it stale.
 * Fetched text is untrusted data: it is parsed for fixed fields only.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Round1Project, Round1Section, Round1Source } from "@/lib/domain/schemas";
import { sha256 } from "@/lib/util/hash";
import { fetchWithRetry } from "@/lib/util/http";
import { ROUND1_FORUM_URL, ROUND1_TRANSPARENCY_URL, round1Slug, round1TransparencyUrl } from "@/lib/intelligence/round1";
import { DATA_DIR, atomicWrite, readJson, writeJson } from "./store";

export const ROUND1_DIR = path.join(DATA_DIR, "external", "round1");
export const ROUND1_MANIFEST = path.join(ROUND1_DIR, "manifest.json");
export const ROUND1_CSV_HEADER = "project_name,matching_pool,extra_round_inflow,other_donors,other_donors_usd,total,usd_sent,link,progress_update";
export const ROUND1_EXPECTED_ROWS = 135;
export const FORUM_JSON_URL = "https://forum.giveth.io/t/2201.json";

export interface Round1Manifest {
  sources: Round1Source[];
}

// ───────────────────────────── Parsers (pure) ─────────────────────────────

/** RFC 4180 CSV: quoted fields with commas, doubled quotes and CRLF or LF line ends. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i] as string;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (quoted) throw new Error("round1.csv: unterminated quoted field");
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

export interface Round1CsvRow {
  name: string;
  matchingPool: string;
  extraRoundInflow: string;
  otherDonors: string;
  otherDonorsUsd: string;
  total: string;
  usdSent: string;
  link: string;
  progressUpdate: string;
}

const DECIMAL = /^\d+(\.\d+)?$/;

/** Parse the report CSV. Throws unless the header matches and there are exactly `expected` rows. */
export function parseRound1Csv(text: string, expected = ROUND1_EXPECTED_ROWS): Round1CsvRow[] {
  const rows = parseCsv(text);
  const header = rows[0]?.join(",").trim();
  if (header !== ROUND1_CSV_HEADER) throw new Error(`round1.csv: unexpected header "${header}"`);
  const out = rows.slice(1).map((r, i) => {
    if (r.length !== 9) throw new Error(`round1.csv: row ${i + 1} has ${r.length} fields`);
    const [name, matchingPool, extraRoundInflow, otherDonors, otherDonorsUsd, total, usdSent, link, progressUpdate] = r.map((x) => x.trim()) as [string, string, string, string, string, string, string, string, string];
    if (!name) throw new Error(`round1.csv: row ${i + 1} has no name`);
    for (const v of [matchingPool, extraRoundInflow, otherDonors, otherDonorsUsd, total, usdSent]) if (!DECIMAL.test(v)) throw new Error(`round1.csv: row ${i + 1} (${name}) has a malformed number "${v}"`);
    return { name, matchingPool, extraRoundInflow, otherDonors, otherDonorsUsd, total, usdSent, link, progressUpdate };
  });
  if (out.length !== expected) throw new Error(`round1.csv: expected ${expected} rows, got ${out.length}`);
  if (new Set(out.map((r) => round1Slug(r.name))).size !== out.length) throw new Error("round1.csv: duplicate project slugs");
  return out;
}

/** Exact decimal string to integer cents (no floating point). */
export function decimalToCents(v: string): number {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(v.trim().replace(/[$,]/g, ""));
  if (!m) throw new Error(`not a decimal amount: ${v}`);
  const frac = (m[2] ?? "").padEnd(3, "0");
  return Number(m[1]) * 100 + Number(frac.slice(0, 2)) + (Number(frac[2]) >= 5 ? 1 : 0);
}

/** Decode a JavaScript template literal body (no substitutions allowed). */
function decodeTemplate(body: string): string {
  if (/(^|[^\\])\$\{/.test(body)) throw new Error("round1.csv: template literal contains substitutions");
  return body.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/gs, (_, e: string) => {
    if (e.startsWith("u{")) return String.fromCodePoint(parseInt(e.slice(2, -1), 16));
    if (e.startsWith("u") && e.length === 5) return String.fromCharCode(parseInt(e.slice(1), 16));
    if (e.startsWith("x") && e.length === 3) return String.fromCharCode(parseInt(e.slice(1), 16));
    return ({ n: "\n", r: "\r", t: "\t", "0": "\0" } as Record<string, string>)[e] ?? e;
  });
}

/** The CSV embedded in the route bundle: the template literal whose first line is the header. */
export function extractCsvFromBundle(js: string): string {
  const start = js.indexOf("`" + ROUND1_CSV_HEADER);
  if (start < 0) throw new Error("route bundle: round1.csv template literal not found");
  let end = start + 1;
  while (end < js.length && !(js[end] === "`" && js[end - 1] !== "\\")) end++;
  if (end >= js.length) throw new Error("route bundle: unterminated template literal");
  return decodeTemplate(js.slice(start + 1, end));
}

export interface BundleExtra {
  name: string;
  receiver: string;
  grants: { amountEth: string; amountUsd: string; txHash: string }[];
  explorerUrl: string | null;
}

/**
 * Direct grants and live Superfluid streams listed in the bundle for some projects
 * (an object literal keyed by project name with receiver, grants[] and streamFallback).
 */
export function extractBundleExtras(js: string): BundleExtra[] {
  const out: BundleExtra[] = [];
  const re = /(?:"([^"]+)"|([A-Za-z_$][\w$]*)):\{receiver:"(0x[0-9a-fA-F]{40})",grants:\[(.*?)\],streamFallback:\{/g;
  // Stream explorer URL template: .../streams/${sender}-${t.receiver}-${token}-0.0
  const tpl = /https:\/\/explorer\.superfluid\.org\/eth-mainnet\/streams\/\$\{([\w$]+)\}-\$\{[\w$]+\.receiver\}-\$\{([\w$]+)\}-0\.0/.exec(js);
  const constant = (name: string | undefined) => (name ? (new RegExp(`[,;\\s{]${name.replace(/\$/g, "\\$")}="(0x[0-9a-fA-F]{40})"`).exec(js)?.[1] ?? null) : null);
  const sender = constant(tpl?.[1]);
  const token = constant(tpl?.[2]);
  for (const m of js.matchAll(re)) {
    const name = (m[1] ?? m[2]) as string;
    const receiver = m[3] as string;
    const grants = [...(m[4] ?? "").matchAll(/\{amountEth:([\d.]+),amountUsd:([\d.]+),txHash:"(0x[0-9a-fA-F]{64})"\}/g)].map((g) => ({ amountEth: g[1] as string, amountUsd: g[2] as string, txHash: g[3] as string }));
    out.push({ name, receiver, grants, explorerUrl: sender && token ? `https://explorer.superfluid.org/eth-mainnet/streams/${sender}-${receiver}-${token}-0.0` : null });
  }
  return out;
}

/** The route module URL imported by the page's inline module script. */
export function routeModuleUrls(html: string, base = ROUND1_TRANSPARENCY_URL): string[] {
  return [...html.matchAll(/import \* as route\d+ from "(\/assets\/route-[A-Za-z0-9_-]+\.js)"/g)].map((m) => new URL(m[1] as string, base).toString());
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}
const text = (html: string) => decodeEntities(html.replace(/<!--.*?-->/gs, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

export interface Round1HtmlRow {
  name: string;
  totalEth: string;
  usd: string;
  website: string | null;
  progressUpdate: string | null;
}

/** Rows of the server-rendered "Who we funded" table. */
export function parseTransparencyTable(html: string): Round1HtmlRow[] {
  const at = html.indexOf("Who we funded");
  if (at < 0) throw new Error("transparency page: 'Who we funded' table not found");
  const tb0 = html.indexOf("<tbody>", at);
  const tb1 = html.indexOf("</tbody>", tb0);
  if (tb0 < 0 || tb1 < 0) throw new Error("transparency page: table body not found");
  const rows = [...html.slice(tb0, tb1).matchAll(/<tr[^>]*>(.*?)<\/tr>/gs)].map((m) => m[1] as string);
  return rows.map((r, i) => {
    const tds = [...r.matchAll(/<td[^>]*>(.*?)<\/td>/gs)].map((m) => m[1] as string);
    if (tds.length !== 5) throw new Error(`transparency page: row ${i + 1} has ${tds.length} cells`);
    const [, recipient, eth, usd, progress] = tds as [string, string, string, string, string];
    return {
      name: text(recipient.replace(/<a\b.*?<\/a>/gs, "")),
      totalEth: text(eth.replace(/<span.*$/s, "")),
      usd: text(usd),
      website: decodeEntities(/<a href="([^"]*)"[^>]*aria-label="Visit /.exec(recipient)?.[1] ?? "") || null,
      progressUpdate: decodeEntities(/<a href="([^"]*)"/.exec(progress)?.[1] ?? "") || null,
    };
  });
}

export function parseTransparencyTotals(html: string): NonNullable<Round1Section["pageTotals"]> {
  const t = text(html);
  const m = /Sent to Ethereum security ([\d,.]+) ETH = \$([\d,]+) at the time of sending · (\d+) security projects \$([\d,]+) raised from co-funders & donors/.exec(t);
  if (!m) throw new Error("transparency page: totals not found");
  return { totalEth: (m[1] as string).replace(/,/g, ""), usdAtSendingCents: decimalToCents(m[2] as string), projects: Number(m[3]), coFundersUsdCents: decimalToCents(m[4] as string) };
}

/** Number formatting used by the report table (en-US). */
export const fmtEth4 = (v: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(v);
export const fmtUsd0 = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);

interface DiscoursePost {
  post_number: number;
  created_at: string;
  cooked: string;
}
interface DiscourseTopic {
  id: number;
  slug: string;
  title: string;
  post_stream: { posts: DiscoursePost[] };
}

const MONTH = /(January|February|March|April|May|June|July|August|September|October|November|December)/.source;

/** Round-level facts from the forum topic. */
export function parseForumTopic(json: string): Round1Section["round"] {
  const t = JSON.parse(json) as DiscourseTopic;
  const posts = [...(t.post_stream?.posts ?? [])].sort((a, b) => a.post_number - b.post_number);
  const base = `https://forum.giveth.io/t/${t.slug}/${t.id}`;
  const p = new RegExp(`\\((${MONTH} \\d{1,2}) - (${MONTH} \\d{1,2}, \\d{4})\\)`).exec(t.title ?? "");
  if (!p) throw new Error(`forum topic: round period not found in title "${t.title}"`);
  const first = text(posts[0]?.cooked ?? "");
  const eligible = /(\d+) [^.]{0,40}?projects into the round/.exec(first);
  const dist = posts.find((x) => /funds have been distributed/i.test(text(x.cooked)));
  const progress = posts.filter((x) => dist && x.post_number > dist.post_number && /\bUpdates\b/.test(text(x.cooked)));
  return {
    name: "Ethereum Security QF Round",
    period: `${p[1]} to ${p[3]}`,
    eligibleProjects: eligible ? Number(eligible[1]) : null,
    distributionAnnouncedAt: dist ? dist.created_at.slice(0, 10) : null,
    distributionPostUrl: dist ? `${base}/${dist.post_number}` : null,
    distributionTxUrls: dist ? [...new Set([...dist.cooked.matchAll(/href="(https:\/\/etherscan\.io\/tx\/0x[0-9a-fA-F]{64})"/g)].map((m) => m[1] as string))] : [],
    progressPostUrls: progress.map((x) => `${base}/${x.post_number}`),
  };
}

export interface Round1Raw {
  html: string;
  route: string;
  forum: string | null;
}

/**
 * All published Round 1 records from the raw copies. Throws (never returns a partial list) when
 * the CSV, the table or their cross-check fails.
 */
export function parseRound1(raw: Round1Raw, checkedAt: string): Pick<Round1Section, "projects" | "pageTotals"> {
  const csv = parseRound1Csv(extractCsvFromBundle(raw.route));
  const table = parseTransparencyTable(raw.html);
  const totals = parseTransparencyTotals(raw.html);
  const extras = new Map(extractBundleExtras(raw.route).map((e) => [e.name, e]));
  if (table.length !== csv.length) throw new Error(`transparency page: ${table.length} table rows, CSV has ${csv.length}`);
  if (totals.projects !== csv.length) throw new Error(`transparency page: states ${totals.projects} projects, CSV has ${csv.length}`);
  const byName = new Map(table.map((r) => [r.name, r]));
  const projects: Round1Project[] = csv.map((r) => {
    const row = byName.get(r.name);
    if (!row) throw new Error(`transparency page: no table row for "${r.name}"`);
    const ex = extras.get(r.name);
    const website = r.link || null;
    const progressUpdateUrl = r.progressUpdate || null;
    if (row.website !== website) throw new Error(`transparency page: website of "${r.name}" differs (${row.website} vs ${website})`);
    if (row.progressUpdate !== progressUpdateUrl) throw new Error(`transparency page: progress update of "${r.name}" differs`);
    const grantEth = (ex?.grants ?? []).reduce((s, g) => s + Number(g.amountEth), 0);
    const grantUsd = (ex?.grants ?? []).reduce((s, g) => s + Number(g.amountUsd), 0);
    const displayedEth = Number(row.totalEth.replace(/,/g, ""));
    if (!ex) {
      if (row.totalEth !== fmtEth4(Number(r.total))) throw new Error(`transparency page: total of "${r.name}" ${row.totalEth} ≠ CSV ${r.total}`);
      if (row.usd !== fmtUsd0(Number(r.usdSent))) throw new Error(`transparency page: USD of "${r.name}" ${row.usd} ≠ CSV ${r.usdSent}`);
    } else if (displayedEth + 1e-4 < Number(r.total) + grantEth || decimalToCents(row.usd) + 100 < decimalToCents(r.usdSent) + Math.round(grantUsd * 100)) {
      throw new Error(`transparency page: displayed total of "${r.name}" is below the CSV total plus direct grants`);
    }
    return {
      id: `r1_${round1Slug(r.name)}`,
      name: r.name,
      slug: round1Slug(r.name),
      transparencyUrl: round1TransparencyUrl(r.name),
      website,
      totalEth: r.total,
      usdWhenSentCents: decimalToCents(r.usdSent),
      components: { matchingPoolEth: r.matchingPool, extraRoundInflowEth: r.extraRoundInflow, otherDonorsEth: r.otherDonors, otherDonorsUsdCents: decimalToCents(r.otherDonorsUsd) },
      progressUpdateUrl,
      displayed: { totalEth: row.totalEth.replace(/,/g, ""), usdWhenSentCents: decimalToCents(row.usd), asOf: checkedAt },
      directGrants: (ex?.grants ?? []).map((g) => ({ amountEth: g.amountEth, amountUsdCents: decimalToCents(g.amountUsd), txHash: g.txHash })),
      liveStream: ex ? { receiver: ex.receiver, explorerUrl: ex.explorerUrl } : null,
      sourceUrls: [round1TransparencyUrl(r.name), ROUND1_TRANSPARENCY_URL],
      checkedAt,
    };
  });
  return { projects, pageTotals: totals };
}

export const ROUND1_LIMITATIONS = [
  "Per-project records come from the TheDAO transparency report: the server-rendered table and the CSV embedded in the page's hashed script bundle. Neither is a documented API, so retrieval may break when the site changes.",
  "The sources publish no per-project payment date and no per-project donor count. Dates shown are the round period and the forum announcement of the distribution.",
  "The Giveth forum topic publishes round-level results only; its per-project spreadsheet is private. The Giveth GraphQL API was checked and not used: it lists 132 projects for the round and no round-specific donor counts.",
  "Displayed totals for projects with a live Superfluid stream change over time and are shown with the date they were read.",
  "Matching is conservative. Renamed entities or teams listed under a different website may appear only as a possible match or not at all.",
];

// ───────────────────────────── Storage and collection ─────────────────────────────

const EXT: Record<Round1Source["key"], string> = { transparency_html: "html", transparency_route: "js", forum_json: "json" };

export function rawFile(src: Pick<Round1Source, "key" | "sha256">): string {
  if (!/^[0-9a-f]{64}$/.test(src.sha256)) throw new Error(`Invalid Round 1 object hash ${src.sha256}`);
  return path.join(ROUND1_DIR, `${src.sha256}.${EXT[src.key]}`);
}

export async function readRound1Manifest(): Promise<Round1Manifest | null> {
  return readJson<Round1Manifest>(ROUND1_MANIFEST);
}

/** Raw copies referenced by the manifest; the hash of each is re-verified. */
export async function readRound1Raw(m: Round1Manifest): Promise<Round1Raw | null> {
  const get = async (key: Round1Source["key"]) => {
    const s = m.sources.find((x) => x.key === key);
    if (!s) return null;
    const body = await fs.readFile(rawFile(s), "utf8");
    if (sha256(body) !== s.sha256) throw new Error(`Round 1 raw copy ${s.key} does not match its sha256`);
    return body;
  };
  const html = await get("transparency_html");
  const route = await get("transparency_route");
  if (!html || !route) return null;
  return { html, route, forum: await get("forum_json") };
}

async function fetchText(url: string, accept: string): Promise<{ body: string; finalUrl: string }> {
  const res = await fetchWithRetry(url, { timeoutMs: 30_000, retries: 2, headers: { accept } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return { body: await res.text(), finalUrl: res.url || url };
}

/** Fetch, validate and store the raw sources. Never replaces a good copy with an unparsable one. */
export async function collectRound1(opts: { log?: (m: string) => void } = {}): Promise<Round1Manifest> {
  const log = opts.log ?? console.log;
  const prev = (await readRound1Manifest()) ?? { sources: [] };
  const prevOf = (k: Round1Source["key"]) => prev.sources.find((s) => s.key === k);
  const now = new Date().toISOString();
  const fresh: { key: Round1Source["key"]; url: string; body: string; method: string }[] = [];
  const stale = (k: Round1Source["key"], error: string): Round1Source | null => {
    const p = prevOf(k);
    return p ? { ...p, stale: true, error: error.slice(0, 300) } : null;
  };
  const next: Round1Source[] = [];

  try {
    const page = await fetchText(ROUND1_TRANSPARENCY_URL, "text/html");
    let route: { url: string; body: string } | null = null;
    for (const u of routeModuleUrls(page.body, page.finalUrl)) {
      const r = await fetchText(u, "text/javascript,*/*;q=0.5");
      if (r.body.includes("`" + ROUND1_CSV_HEADER)) {
        route = { url: u, body: r.body };
        break;
      }
    }
    if (!route) throw new Error("no route module with the round1.csv template literal");
    parseRound1({ html: page.body, route: route.body, forum: null }, now);
    fresh.push({ key: "transparency_html", url: ROUND1_TRANSPARENCY_URL, body: page.body, method: "HTTP GET, server-rendered HTML table and totals" });
    fresh.push({ key: "transparency_route", url: route.url, body: route.body, method: "HTTP GET of the route module imported by the page; CSV template literal and grant/stream object" });
  } catch (err) {
    const msg = String(err instanceof Error ? err.message : err);
    log(`Round 1: transparency report not updated: ${msg}`);
    for (const k of ["transparency_html", "transparency_route"] as const) {
      const s = stale(k, msg);
      if (s) next.push(s);
    }
  }
  try {
    const forum = await fetchText(FORUM_JSON_URL, "application/json");
    parseForumTopic(forum.body);
    fresh.push({ key: "forum_json", url: FORUM_JSON_URL, body: forum.body, method: "HTTP GET, Discourse topic JSON" });
  } catch (err) {
    const msg = String(err instanceof Error ? err.message : err);
    log(`Round 1: forum topic not updated: ${msg}`);
    const s = stale("forum_json", msg);
    if (s) next.push(s);
  }

  for (const f of fresh) {
    const src: Round1Source = { key: f.key, url: f.url, retrievedAt: now, sha256: sha256(f.body), method: f.method, stale: false, error: null };
    const file = rawFile(src);
    try {
      await fs.access(file);
    } catch {
      await atomicWrite(file, f.body);
    }
    next.push(src);
  }
  const order = ["transparency_html", "transparency_route", "forum_json"];
  next.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  const manifest: Round1Manifest = { sources: next };
  await writeJson(ROUND1_MANIFEST, manifest);
  // Keep only the copies the manifest references.
  const keep = new Set(next.map((s) => path.basename(rawFile(s))));
  for (const f of await fs.readdir(ROUND1_DIR)) if (f !== "manifest.json" && !keep.has(f)) await fs.rm(path.join(ROUND1_DIR, f));
  log(`Round 1: ${fresh.length} source(s) updated, ${next.filter((s) => s.stale).length} stale`);
  return manifest;
}

/** The published Round 1 section, or an "unavailable" section when no raw copies exist. */
export async function buildRound1Section(
  match: (projects: Round1Project[]) => Pick<Round1Section, "initiativeMatches" | "organizationMatches">,
): Promise<Round1Section> {
  const m = await readRound1Manifest();
  const raw = m ? await readRound1Raw(m) : null;
  const html = m?.sources.find((s) => s.key === "transparency_html");
  const base: Round1Section = {
    status: "unavailable",
    transparencyUrl: ROUND1_TRANSPARENCY_URL,
    forumUrl: ROUND1_FORUM_URL,
    checkedAt: html?.retrievedAt ?? null,
    sources: m?.sources ?? [],
    round: { name: "Ethereum Security QF Round", period: null, eligibleProjects: null, distributionAnnouncedAt: null, distributionPostUrl: null, distributionTxUrls: [], progressPostUrls: [] },
    pageTotals: null,
    projects: [],
    initiativeMatches: {},
    organizationMatches: {},
    limitations: ROUND1_LIMITATIONS,
  };
  if (!raw || !html) return base;
  const parsed = parseRound1(raw, html.retrievedAt);
  const round = raw.forum ? parseForumTopic(raw.forum) : base.round;
  return { ...base, status: "available", round, ...parsed, ...match(parsed.projects) };
}
