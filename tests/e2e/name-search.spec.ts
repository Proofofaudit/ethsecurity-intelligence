import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { dataset, expectNoHorizontalOverflow } from "./helpers";

/** Fictional fixture: tests/fixtures/badge-holders.csv (Alex Example, @example_alex). */
const EMPTY_BASE = `http://127.0.0.1:${Number(process.env.E2E_PORT ?? 3100) + 1}`;

const input = (page: Page) => page.getByLabel("Type your name or X handle");

function watch(page: Page) {
  const seen: { method: string; url: string; body: string }[] = [];
  page.on("request", (r) => seen.push({ method: r.method(), url: r.url(), body: r.postData() ?? "" }));
  return seen;
}

test("the field is empty, labeled, and Home keeps its intro short", async ({ page }) => {
  await page.goto("/");
  await expect(input(page)).toBeVisible();
  await expect(input(page)).toHaveValue("");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.locator("[data-name-search-state]")).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test("keyboard-only search: type a typo, pick from the list, see grouped cards with sources", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle"); // handlers attach on hydration
  await page.keyboard.press("Tab"); // skip link
  await input(page).focus();
  await page.keyboard.type("alxe exmaple");
  const list = page.locator('[data-name-search-state="disambiguate"]');
  await expect(list).toBeVisible();
  const options = list.locator("[data-holder-option]");
  await expect(options.first()).toContainText("Alex Example");
  await expect(options.first()).toContainText("Blossom Labs");
  await expect(options.first()).toContainText("@example_alex");
  // Nothing is selected until the visitor chooses.
  await expect(page.locator('[data-name-search-state="results"]')).toHaveCount(0);
  await options.first().focus();
  await page.keyboard.press("Enter");
  const results = page.locator('[data-name-search-state="results"]');
  await expect(results).toBeVisible();
  const headings = await results.locator("[data-result-group] h3").allInnerTexts();
  expect(headings.map((h) => h.replace(/\s+\d+$/, ""))).toEqual(["Your organisation", "Your repos", "Your security area"]);
  const cards = results.locator("[data-initiative-card]");
  expect(await cards.count()).toBeGreaterThan(2);
  for (const c of await cards.all()) {
    await expect(c.locator("[data-why]")).toHaveCount(1);
    expect(await c.locator("[data-evidence-links] a").count()).toBeGreaterThan(0);
    await expect(c.getByRole("link", { name: "Open dossier" })).toBeVisible();
  }
  // Alphabetical inside every group.
  for (const g of await results.locator("[data-result-group]").all()) {
    const titles = await g.locator("article h4").allInnerTexts();
    expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b)));
  }
  await expectNoHorizontalOverflow(page);
});

test("a handle with or without @ finds the holder; one exact match needs no pick", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await input(page).fill("@EXAMPLE_ALEX");
  await expect(page.locator('[data-name-search-state="results"]')).toContainText("Alex Example");
  await input(page).fill("example_alex");
  await expect(page.locator('[data-name-search-state="results"]')).toContainText("@example_alex");
  await input(page).fill("sam sample");
  await expect(page.locator('[data-name-search-state="no-match"]')).toBeVisible();
});

test("no match shows the honest message with links to browse all and My Affiliations", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await input(page).fill("zzqx nobody");
  const box = page.locator('[data-name-search-state="no-match"]');
  await expect(box).toContainText("No public connection was found for that name or handle.");
  await expect(box.getByRole("link", { name: `Browse all ${dataset.initiatives.length} initiatives` })).toHaveAttribute("href", "/initiatives");
  await expect(box.getByRole("link", { name: "My Affiliations" })).toHaveAttribute("href", "/workspace#affiliations");
});

test("the typed query is never sent, stored or put in the URL", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const requests = watch(page);
  const before = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  const secret = "alxe exmaple zzqprobe";
  await input(page).fill(secret);
  await page.keyboard.press("Enter");
  await input(page).fill("alxe exmaple");
  await page.locator("[data-holder-option]").first().click();
  await page.waitForTimeout(500);
  const needle = /alxe|exmaple|zzqprobe|example_alex|Alex(%20|\+| )Example/i;
  for (const r of requests) {
    expect(r.url, `${r.method} ${r.url}`).not.toMatch(needle);
    expect(r.body).toBe("");
    expect(r.method).toBe("GET");
  }
  expect(page.url()).not.toMatch(/alxe|exmaple|zzqprobe/i);
  const after = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(after).not.toMatch(needle);
  expect(Object.keys(JSON.parse(after)).filter((k) => !(k in JSON.parse(before)))).toEqual([]);
  expect(await page.evaluate(() => JSON.stringify({ ...sessionStorage }))).not.toMatch(needle);
  expect(await page.evaluate(() => document.cookie)).not.toMatch(needle);
});

test("emails from the CSV never appear in the page", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const html = await page.content();
  expect(html).not.toMatch(/@example\.invalid/);
  await input(page).fill("alex");
  expect(await page.content()).not.toMatch(/@example\.invalid/);
});

test("without the CSV, Home says the search is not loaded and lists nobody", async ({ page }) => {
  await page.goto(`${EMPTY_BASE}/`);
  await expect(page.locator('[data-name-search-state="not-loaded"]')).toContainText("Name search is not loaded yet");
  await expect(input(page)).toBeDisabled();
  await expect(page.locator("[data-holder-option]")).toHaveCount(0);
});

test("onboarding shows four steps, dismisses, and stays dismissed in this browser only", async ({ page }) => {
  await page.goto("/");
  const box = page.locator("[data-onboarding]");
  await expect(box).toBeVisible();
  await expect(box.getByRole("listitem")).toHaveCount(4);
  await expect(box).toContainText("Voting happens only on TheDAO's site, this tool never sees your vote");
  const requests = watch(page);
  await box.getByRole("button", { name: "Dismiss" }).click();
  await expect(box).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("esi.onboarding"))).toBe("dismissed");
  expect(requests.filter((r) => r.method !== "GET")).toEqual([]);
  await page.reload();
  await expect(page.locator("[data-onboarding]")).toHaveCount(0);
});

test("Home shows one official strip, compact calendar, one what-changed line, people map and Why AI", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("official-strip")).toHaveCount(1);
  await expect(page.locator("[data-vote-calendar]")).toHaveCount(1);
  await expect(page.locator("[data-what-changed]")).toHaveCount(1);
  await expect(page.locator("[data-people-map-entry] a")).toHaveAttribute("href", "/teams");
  await expect(page.locator("[data-why-ai]")).toContainText("never sees your vote");
  const y = (sel: string) => page.locator(sel).first().evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  expect(await y("[data-name-search]")).toBeLessThan(await y("[data-vote-calendar]"));
  expect(await y("[data-vote-calendar]")).toBeLessThan(await y('[data-testid="official-strip"]'));
});

test("initiative cards: letter mark, no summary paragraph, badges with text, dossier link, alphabetical", async ({ page }) => {
  await page.goto("/initiatives");
  const grid = page.locator("[data-initiative-grid]");
  await expect(grid.locator("[data-initiative-card]")).toHaveCount(dataset.initiatives.length);
  const first = grid.locator("[data-initiative-card]").first();
  await expect(first.locator("[data-letter-mark]")).toHaveCount(1);
  await expect(first.getByRole("link", { name: "Open dossier" })).toBeVisible();
  await expect(first.getByRole("img", { name: /Received .* still needed/ })).toBeVisible();
  const titles = await grid.locator("[data-initiative-card] h3").allInnerTexts();
  expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b)));
  for (const img of await page.locator("img").all()) expect(await img.getAttribute("alt")).toBeTruthy();
});

test("dossier puts unique research above the official figures and gives every chart a text alternative", async ({ page }) => {
  await page.goto(`/initiatives/${dataset.initiatives[0]!.slug}`);
  const research = page.locator("[data-team-research]");
  const official = page.locator("[data-official-figures]");
  await expect(research).toBeVisible();
  await expect(official.getByRole("heading", { name: "Official figures (from TheDAO)" })).toBeVisible();
  expect((await research.boundingBox())!.y).toBeLessThan((await official.boundingBox())!.y);
  await expect(research).toContainText(/Not yet researched|Team/);
  const frame = official.locator("[data-chart]");
  await expect(frame.locator("[data-chart-alt]")).not.toBeEmpty();
  await expect(frame.getByRole("button", { name: /What is this\? Funding/ })).toBeVisible();
  await expect(frame.getByRole("img", { name: /Received .* still needed/ })).toBeVisible();
});

for (const theme of ["light", "dark"] as const) {
  test(`Home with results has no serious WCAG AA violations (${theme})`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem("esi.theme", t), theme);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await input(page).fill("alex example");
    await expect(page.locator('[data-name-search-state="results"]')).toBeVisible();
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).include("main").analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes[0]?.target}`)).toEqual([]);
  });
}
