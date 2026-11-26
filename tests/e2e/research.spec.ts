import { expect, test, type Page } from "@playwright/test";
import { byTitle, dataset, expectNoHorizontalOverflow, firstSlug, isMobile } from "./helpers";

const N = dataset.initiatives.length;
const resultCount = (page: Page) => page.locator("p[aria-live=polite]").first();

async function openFilters(page: Page) {
  if (isMobile(page)) {
    await page.getByRole("button", { name: /^Filters/ }).click();
    return page.locator("#mobile-filters");
  }
  return page.getByRole("complementary", { name: "Filters" });
}

test("filters change the result count to the dataset-derived values", async ({ page }) => {
  await page.goto("/research");
  await expect(resultCount(page)).toContainText(`${N} of ${N} initiatives`);

  const filters = await openFilters(page);
  await filters.getByRole("radiogroup", { name: "Grant or RFP" }).getByRole("radio", { name: "RFP" }).click();
  const rfps = dataset.initiatives.filter((i) => i.type === "rfp").length;
  await expect(page).toHaveURL(/type=rfp/);
  await expect(resultCount(page)).toContainText(`${rfps} of ${N} initiatives`);

  const cat = "opsec";
  const both = dataset.initiatives.filter((i) => i.type === "rfp" && i.categories.some((c) => c.slug === cat)).length;
  await page.goto(`/research?type=rfp&cat=${cat}`);
  await expect(resultCount(page)).toContainText(`${both} of ${N} initiatives`);

  const onlyCat = dataset.initiatives.filter((i) => i.categories.some((c) => c.slug === cat)).length;
  await page.goto(`/research?cat=${cat}`);
  await expect(resultCount(page)).toContainText(`${onlyCat} of ${N} initiatives`);

  await page.goto("/research?q=zzzz-no-such-term");
  await expect(page.getByText("No initiative matches these filters.")).toBeVisible();
  await expect(resultCount(page)).toContainText(`0 of ${N} initiatives`);
});

test("search box filters by text and the default order is alphabetical", async ({ page }) => {
  await page.goto("/research");
  const links = page.locator(isMobile(page) ? "ul.md\\:hidden li a[href^='/initiatives/']" : "table a[href^='/initiatives/']");
  await expect(links.first()).toHaveText(byTitle[0]!.title);
  await page.getByRole("searchbox", { name: "Search initiatives" }).fill("Blobscan");
  await expect(page).toHaveURL(/q=Blobscan/);
  await expect(resultCount(page)).not.toContainText(`${N} of ${N}`);
});

test("table and card views switch and keep every result", async ({ page }) => {
  await page.goto("/research");
  const view = page.getByRole("group", { name: "View" });
  await expect(view.getByRole("button", { name: "table" })).toHaveAttribute("aria-pressed", "true");
  if (!isMobile(page)) await expect(page.locator("table tbody tr")).toHaveCount(N);
  await view.getByRole("button", { name: "cards" }).click();
  await expect(page).toHaveURL(/view=cards/);
  await expect(view.getByRole("button", { name: "cards" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("table")).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: /for comparison$/ })).toHaveCount(N);
  await expectNoHorizontalOverflow(page);
});

test("selecting two initiatives opens a comparison with Show only differences", async ({ page }) => {
  await page.goto("/research?view=cards");
  const boxes = page.getByRole("checkbox", { name: /for comparison$/ });
  await boxes.nth(0).check();
  await boxes.nth(1).check();
  await page.getByRole("link", { name: "Compare 2" }).click();
  await expect(page).toHaveURL(new RegExp(`/research/compare\\?ids=${byTitle[0]!.slug},${byTitle[1]!.slug}`));

  const summary = page.getByText(/rows differ ·/);
  await expect(summary).toBeVisible();
  const m = /(\d+) of (\d+) rows differ · (\d+) identical/.exec((await summary.textContent()) ?? "");
  expect(m).not.toBeNull();
  const [differ, total, same] = [Number(m![1]), Number(m![2]), Number(m![3])];
  expect(differ + same).toBe(total);
  const sameRows = page.getByText("Same for all", { exact: true });
  await expect(sameRows).toHaveCount(same);
  await page.getByText("Show only differences").click();
  await expect(sameRows).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test("dossier sections expand and the source inspector opens", async ({ page }) => {
  const ini = dataset.initiatives.find((i) => dataset.claims.some((c) => c.initiativeId === i.id)) ?? dataset.initiatives[0]!;
  await page.goto(`/initiatives/${ini.slug}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const triggers = page.locator("[data-radix-collection-item][aria-expanded]");
  const count = await triggers.count();
  expect(count).toBeGreaterThan(5);
  await page.getByRole("button", { name: "Expand all sections" }).click();
  await expect(page.locator("[aria-expanded=false][data-radix-collection-item]")).toHaveCount(0);
  await page.getByRole("button", { name: "Collapse all sections" }).click();
  await expect(page.locator("[aria-expanded=true][data-radix-collection-item]")).toHaveCount(0);

  await page.goto(`/initiatives/${ini.slug}#sources`);
  await expect(page.locator("#sources [aria-expanded=true]")).toHaveCount(1);
  await page.getByRole("button", { name: "Expand all sections" }).click();
  await page.getByRole("button", { name: /^Inspect sources for:/ }).first().click();
  const sheet = page.getByRole("dialog", { name: "Source inspector" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("How this was checked")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expectNoHorizontalOverflow(page);
});

test("a correction submitted from the inspector is accepted for moderation", async ({ page }) => {
  const claim = dataset.claims[0]!;
  const ini = dataset.initiatives.find((i) => i.id === claim.initiativeId)!;
  await page.goto(`/initiatives/${ini.slug}#claim=${claim.id}`);
  const sheet = page.getByRole("dialog", { name: "Source inspector" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Suggest a correction to this statement" }).click();
  const dialog = page.getByRole("dialog", { name: "Suggest a correction" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Proposed correction").fill("End-to-end test correction, please reject.");
  await dialog.getByLabel("Supporting evidence link (https)").fill("https://example.com/e2e-evidence");
  await dialog.getByLabel("Explanation").fill("Automated Playwright test of the correction form. Not a real submission.");
  await page.waitForTimeout(4200); // the spam check rejects forms sent within 4 seconds
  await dialog.getByRole("button", { name: "Submit" }).click();
  await expect(dialog.getByRole("button", { name: "Close" })).toBeVisible();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
});

test("relationship graph renders nodes", async ({ page }) => {
  await page.goto(`/research/graph?type=initiative&id=${firstSlug}`);
  await expect(page.locator(".react-flow__node").first()).toBeVisible();
  expect(await page.locator(".react-flow__node").count()).toBeGreaterThan(3);
});
