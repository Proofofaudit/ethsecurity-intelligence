/**
 * Screenshots of the main pages for docs/screenshots (`npm run screenshots`, after `npm run build`).
 *
 * Starts `next start` on a free port with the published dataset (MONGODB_URI empty, corrections in
 * a temporary directory), or uses SCREENSHOT_BASE_URL when set. Captures every page at 1440x900
 * and 412x915 in light and dark into docs/screenshots/<page>-<viewport>-<theme>.png.
 *
 * My Workspace is seeded in the browser with a sample draft built from the alphabetical order of
 * initiative titles, so no initiative is singled out. The sample affiliation is an example
 * organization name, not a real person's data. Nothing secret is on screen: the server runs
 * without database credentials.
 */
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, type Page } from "@playwright/test";
import type { Dataset } from "@/lib/domain/schemas";
import { isCoiOrganization } from "@/lib/disclosure";
import { briefingFor, openQuestionsFor, round1History, similarFor } from "@/lib/intelligence/service";

const OUT = path.join(process.cwd(), "docs", "screenshots");
const PORT = Number(process.env.SCREENSHOT_PORT ?? 3200);
const BASE = process.env.SCREENSHOT_BASE_URL ?? `http://127.0.0.1:${PORT}`;
const VIEWPORTS = [
  { name: "1440", width: 1440, height: 900, mobile: false },
  { name: "412", width: 412, height: 915, mobile: true },
] as const;
const THEMES = ["light", "dark"] as const;

const dataset = JSON.parse(await fs.readFile(path.join(process.cwd(), "data", "published", "dataset.json"), "utf8")) as Dataset;
const alphabetical = [...dataset.initiatives].sort((a, b) => a.title.localeCompare(b.title));
const first = alphabetical[0]!;
/** The dossier that carries the conflict-of-interest note, captured to document that note. */
const disclosed = dataset.initiatives.find((i) => isCoiOrganization(i.organizationId));
/**
 * The dossier used for the Items 8 to 14 sections: the alphabetically first initiative that has
 * Round 1 matches, similar pairs and open questions; the first initiative if none has all three.
 */
const rich =
  alphabetical.find((i) => (round1History(dataset, i.id)?.records.length ?? 0) > 0 && (similarFor(dataset, i.id)?.length ?? 0) > 0 && (openQuestionsFor(dataset, i.id)?.length ?? 0) > 0) ?? first;
const richQuestions = openQuestionsFor(dataset, rich.id) ?? [];
const richBriefing = briefingFor(dataset, rich.id)?.items ?? [];
const compareIds = alphabetical.slice(0, 3).map((i) => i.slug);

const now = new Date().toISOString();
const tiers: Record<string, "S" | "A" | "B"> = {};
alphabetical.slice(0, 4).forEach((i) => (tiers[i.id] = "S"));
alphabetical.slice(4, 8).forEach((i) => (tiers[i.id] = "A"));
alphabetical.slice(8, 12).forEach((i) => (tiers[i.id] = "B"));
const WORKSPACE = {
  version: 1,
  initiatives: alphabetical.slice(0, 4).map((i) => ({ id: i.id, addedAt: now, reviewedAt: null, priority: null })),
  ballotDraft: { tiers, updatedAt: now },
  affiliations: { entries: ["Example Labs"], overrides: {}, suggested: false },
  openQuestions: Object.fromEntries(richQuestions.slice(0, 1).map((q) => [q.id, { markedAt: now }])),
  briefingRead: Object.fromEntries(richBriefing.slice(0, 2).map((b) => [b.id, { readAt: now }])),
  progress: Object.fromEntries(
    alphabetical.slice(0, 4).map((i, n) => [i.id, { state: (["reviewed", "reading", "revisit", "not_started"] as const)[n]!, at: now, reason: n === 2 ? "A comment was added after your review." : null, seen: null }]),
  ),
  interest: { focus: ["cat:wallets-signing", "mode:smart-contract-auditor"], keywords: ["fuzzing"], suggested: false },
};

interface Shot {
  name: string;
  path: string;
  /** Runs after navigation, before the capture. */
  prepare?: (page: Page) => Promise<void>;
}

const scrollTo = (selector: string) => async (page: Page) => {
  await page.waitForTimeout(300); // a #section hash opens its accordion item after hydration
  await page.locator(selector).first().evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(150);
};

const SHOTS: Shot[] = [
  { name: "overview", path: "/" },
  { name: "research-table", path: "/research" },
  { name: "research-cards", path: "/research?view=cards" },
  { name: "dossier", path: `/initiatives/${first.slug}` },
  ...(disclosed ? [{ name: "dossier-poa", path: `/initiatives/${disclosed.slug}` }] : []),
  {
    name: "source-inspector",
    path: `/initiatives/${first.slug}#sources`,
    prepare: async (page) => {
      await page.getByRole("button", { name: /^Inspect sources for:/ }).first().click();
      await page.getByRole("dialog", { name: "Source inspector" }).waitFor();
      await page.waitForTimeout(300);
    },
  },
  { name: "graph", path: `/research/graph?type=initiative&id=${first.slug}`, prepare: async (page) => void (await page.waitForTimeout(1200)) },
  { name: "coverage", path: "/research/coverage" },
  { name: "compare", path: `/research/compare?ids=${compareIds.join(",")}` },
  { name: "workspace", path: "/workspace" },
  { name: "workspace-ballot-prep", path: "/workspace", prepare: scrollTo("[data-ballot-prep]") },
  { name: "workspace-affiliations", path: "/workspace", prepare: scrollTo("[data-affiliations]") },
  { name: "workspace-may-interest", path: "/workspace", prepare: scrollTo("[data-may-interest]") },
  { name: "dossier-evidence-card", path: `/initiatives/${rich.slug}`, prepare: scrollTo("[data-testid=evidence-card]") },
  { name: "dossier-round1", path: `/initiatives/${rich.slug}#round1`, prepare: scrollTo("#round1") },
  { name: "dossier-similar", path: `/initiatives/${rich.slug}#similar`, prepare: scrollTo("#similar") },
  { name: "dossier-open-questions", path: `/initiatives/${rich.slug}#questions`, prepare: scrollTo("#questions") },
  { name: "dossier-briefing", path: `/initiatives/${rich.slug}#briefing`, prepare: scrollTo("#briefing") },
  { name: "research-questions", path: "/research/questions" },
  { name: "workspace-review-progress", path: "/workspace", prepare: scrollTo("[data-review-progress]") },
  { name: "workspace-briefing", path: "/workspace/briefing" },
  { name: "lab", path: "/lab" },
  { name: "methodology-privacy", path: "/methodology", prepare: scrollTo("#privacy") },
  { name: "status", path: "/status" },
  { name: "about", path: "/about" },
];

async function waitForServer(url: string, ms: number) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server at ${url} did not start within ${ms} ms`);
}

let server: ChildProcess | null = null;
let stateDir: string | null = null;
if (!process.env.SCREENSHOT_BASE_URL) {
  stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "esi-shots-"));
  server = spawn(process.execPath, [path.join("node_modules", "next", "dist", "bin", "next"), "start", "-p", String(PORT)], {
    env: { ...process.env, MONGODB_URI: "", ESI_LOCAL_STATE_DIR: stateDir, NODE_ENV: "production", ESI_LIVE_MANIFEST: "off" },
    stdio: ["ignore", "ignore", "inherit"],
  });
  await waitForServer(BASE, 60_000);
}

const browser = await chromium.launch();
let count = 0;
try {
  await fs.mkdir(OUT, { recursive: true });
  for (const vp of VIEWPORTS) {
    for (const theme of THEMES) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
        isMobile: vp.mobile,
        hasTouch: vp.mobile,
        colorScheme: theme,
        locale: "en-US",
        timezoneId: "UTC",
      });
      await context.addInitScript(
        ([ws, th]) => {
          window.localStorage.setItem("esi.workspace", ws);
          window.localStorage.setItem("esi.theme", th);
        },
        [JSON.stringify(WORKSPACE), theme] as const,
      );
      const page = await context.newPage();
      for (const shot of SHOTS) {
        await page.goto(`${BASE}${shot.path}`, { waitUntil: "load" });
        // Some pages keep prefetching linked routes; settle briefly instead of waiting for idle.
        await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
        await page.evaluate(() => document.fonts.ready);
        if (shot.prepare) await shot.prepare(page);
        const file = path.join(OUT, `${shot.name}-${vp.name}-${theme}.png`);
        await page.screenshot({ path: file });
        count++;
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
  server?.kill("SIGTERM");
  if (stateDir) await fs.rm(stateDir, { recursive: true, force: true });
}
console.log(`Wrote ${count} screenshots to ${path.relative(process.cwd(), OUT)}`);
