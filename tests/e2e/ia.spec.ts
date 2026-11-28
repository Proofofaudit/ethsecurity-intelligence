import { expect, test } from "@playwright/test";
import { REDIRECTS } from "@/lib/redirects";
import { dataset, expectNoHorizontalOverflow, isMobile } from "./helpers";

test.describe("redirects", () => {
  for (const [source, destination] of REDIRECTS) {
    test(`${source} redirects permanently to ${destination}`, async ({ request }) => {
      const res = await request.get(source, { maxRedirects: 0 });
      expect(res.status()).toBe(308);
      expect(new URL(res.headers().location!, "http://x").pathname + new URL(res.headers().location!, "http://x").hash).toBe(destination);
      const live = await request.get(destination.split("#")[0]!);
      expect(live.status()).toBe(200);
    });
  }

  test("query strings survive the redirect", async ({ request }) => {
    const res = await request.get("/research/compare?ids=a,b", { maxRedirects: 0 });
    expect(decodeURIComponent(res.headers().location!)).toContain("ids=a,b");
    const graph = await request.get("/research/graph?type=person&id=x", { maxRedirects: 0 });
    expect(graph.headers().location).toContain("type=person");
  });

  test("/workspace/briefing stays where it is", async ({ request }) => {
    const res = await request.get("/workspace/briefing", { maxRedirects: 0 });
    expect(res.status()).toBe(200);
  });
});

test("the header has the five tabs and no What-if or developer link", async ({ page }) => {
  await page.goto("/");
  if (isMobile(page)) await page.getByRole("button", { name: "Menu" }).click();
  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav.getByRole("link")).toHaveCount(5);
  await expect(nav).not.toContainText(/what-if|lab|developer/i);
  const footer = page.getByRole("contentinfo");
  await expect(footer.getByRole("link", { name: "Developers" })).toHaveAttribute("href", "/dev");
});

test("the developer page is reachable from the footer and holds the MCP, export and reader tools", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("contentinfo").getByRole("link", { name: "Developers" }).click();
  await expect(page).toHaveURL(/\/dev$/);
  await expect(page.getByRole("button", { name: "Download SKILL.md" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Export evidence bundle" })).toBeVisible();
});

test("Initiatives shows all initiatives alphabetically with the required filters and sections", async ({ page }) => {
  await page.goto("/initiatives");
  const cards = page.getByRole("checkbox", { name: /for comparison$/ });
  await expect(cards).toHaveCount(dataset.initiatives.length);
  const titles = await page.locator("ul li a[href^='/initiatives/']").evaluateAll((as) => as.map((a) => a.textContent ?? ""));
  const first = [...dataset.initiatives].sort((a, b) => a.title.localeCompare(b.title, "en"))[0]!.title;
  expect(titles[0]).toBe(first);
  if (!isMobile(page)) {
    const filters = page.getByRole("complementary", { name: "Filters" });
    for (const g of ["Grant or RFP", "Official category", "Evidence status", "Affiliation", "Milestones"]) await expect(filters.getByText(g, { exact: true }).first()).toBeVisible();
  }
  for (const id of ["compare", "questions", "milestones", "funding", "changes"]) await expect(page.locator(`section#${id}`)).toBeAttached();
  await expect(page.getByRole("link", { name: "What changed" })).toHaveCount(1);
  await expectNoHorizontalOverflow(page);
});

test("the affiliation filter keeps only initiatives that share an official group", async ({ page }) => {
  test.skip(isMobile(page), "Filters live in a sheet on small screens.");
  const boxes = page.getByRole("checkbox", { name: /for comparison$/ });
  await page.goto("/initiatives?aff=none");
  await expect.poll(() => boxes.count()).toBeGreaterThan(0);
  const none = await boxes.count();
  await page.goto("/initiatives?aff=any");
  await expect.poll(() => boxes.count()).toBeGreaterThan(0);
  const any = await boxes.count();
  expect(none + any).toBe(dataset.initiatives.length);
});

test("the compare tool renders inside Initiatives for two to five picks", async ({ page }) => {
  const [a, b] = [...dataset.initiatives].sort((x, y) => x.title.localeCompare(y.title, "en"));
  await page.goto(`/initiatives?ids=${a!.slug},${b!.slug}#compare`);
  await expect(page.getByText(/rows differ ·/)).toBeVisible();
});

test("What changed hides funding changes under one dollar", async ({ page }) => {
  await page.goto("/initiatives#changes");
  const section = page.locator("section#changes");
  await expect(section).toContainText(/funding changes under one dollar are hidden/);
  const text = (await section.innerText()).replace(/,/g, "");
  const moves = [...text.matchAll(/Official raised \$(\d+\.\d\d) → \$(\d+\.\d\d)/g)].map((m) => Math.abs(Number(m[2]) - Number(m[1])));
  expect(moves.length).toBeGreaterThan(0);
  for (const m of moves) expect(m).toBeGreaterThanOrEqual(1);
});

test("Teams shows the people map and a card per initiative with a Not yet researched state", async ({ page }) => {
  await page.goto("/teams");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("Dotted lines are stated in proposal text")).toBeVisible();
  const cards = page.getByTestId("team-card");
  await expect(cards).toHaveCount(dataset.initiatives.length);
  await expect(cards.filter({ hasText: "Not yet researched" }).first()).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("About merges methodology, freshness, corrections, disclosure and Why AI is here under anchors", async ({ page }) => {
  await page.goto("/about");
  for (const id of ["coi", "ai", "how-research-is-made", "methodology", "freshness", "corrections"]) await expect(page.locator(`#${id}`)).toBeAttached();
  await expect(page.locator("#ai")).toContainText("It decides nothing");
  await expect(page.locator("#ai")).toContainText("never sees your vote");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
});

test("Home has one official strip with a what-is-this tip per metric, and research above it", async ({ page }) => {
  await page.goto("/");
  const strip = page.getByTestId("official-strip");
  await expect(strip.getByRole("heading", { name: "Official figures (from TheDAO)" })).toBeVisible();
  await expect(page.getByTestId("official-strip")).toHaveCount(1);
  const tips = strip.getByRole("button", { name: /^What is this\?/ });
  expect(await tips.count()).toBeGreaterThanOrEqual(4);
  await expect(strip.locator("[data-headline]")).toContainText("TheDAO ask");
  await expect(strip.getByRole("link", { name: /Official page/ })).toHaveAttribute("href", /^https:\/\//);
  const stripY = (await strip.boundingBox())!.y;
  const researchY = (await page.getByRole("region", { name: "Research status" }).boundingBox())!.y;
  expect(researchY).toBeLessThan(stripY);
  await expect(page.locator("[data-vote-calendar]")).toBeVisible();
});

test("What-if is a panel inside My Ballot", async ({ page }) => {
  await page.goto("/workspace#what-if");
  await expect(page.getByRole("heading", { name: "What-if panel" })).toBeVisible();
});
