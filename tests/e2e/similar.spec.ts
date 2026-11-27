import { expect, test, type Page } from "@playwright/test";
import { similarPairs, type SimilarPair } from "@/lib/intelligence/similar";
import { dataset, expectNoHorizontalOverflow, isMobile } from "./helpers";

const N = dataset.initiatives.length;
const pairs: SimilarPair[] = similarPairs({ initiatives: dataset.initiatives, pledges: dataset.pledges, organizations: dataset.organizations, groups: dataset.vote.groupsAvailable ? dataset.vote.initiativeGroups : null });
const pairsOf = (id: string) => pairs.filter((p) => p.a === id || p.b === id);
const subject = dataset.initiatives.find((i) => i.shortTitle === "Echidna")!;
const resultCount = (page: Page) => page.locator("p[aria-live=polite]").first();
const withLabel = (label: string | null) => new Set(pairs.filter((p) => !label || p.label === label).flatMap((p) => [p.a, p.b])).size;

test.describe("Similar initiatives", () => {
  test("the dossier panel shows every pair with label, notice, signals and quotes from both proposals", async ({ page }) => {
    const expected = pairsOf(subject.id);
    expect(expected.length).toBeGreaterThan(0);
    await page.goto(`/initiatives/${subject.slug}#similar`);
    const panel = page.getByTestId("similar-initiatives");
    await expect(panel).toBeVisible();
    const items = panel.getByTestId("similar-pair");
    await expect(items).toHaveCount(expected.length);
    for (let i = 0; i < expected.length; i++) {
      const it = items.nth(i);
      await expect(it.getByTestId("similar-label")).toHaveText(/^(Possible overlap|Possible complement|Same organization)$/);
      await expect(it.getByTestId("similar-notice")).toHaveText("This is a research hypothesis, not a finding.");
      const quotes = it.locator("[data-official-quote]");
      expect(await quotes.count()).toBeGreaterThanOrEqual(2);
      await expect(quotes.first()).toContainText("Applicant statement");
      await expect(quotes.first().getByRole("link")).toHaveAttribute("href", new RegExp(`^${subject.url}#(why|in_scope)$`));
    }
    await expect(panel).not.toContainText(/duplicat|waste/i);
    await expectNoHorizontalOverflow(page);
  });

  test("'Compare these' opens the comparison with both initiatives selected", async ({ page }) => {
    const first = pairsOf(subject.id)
      .map((p) => dataset.initiatives.find((i) => i.id === (p.a === subject.id ? p.b : p.a))!)
      .sort((a, b) => a.title.localeCompare(b.title, "en"))[0]!;
    await page.goto(`/initiatives/${subject.slug}#similar`);
    await page.getByTestId("similar-pair").first().getByTestId("compare-these").click();
    await expect(page).toHaveURL(new RegExp(`/research/compare\\?ids=${subject.slug},${first.slug}$`));
    await expect(page.getByRole("button", { name: /^Remove / })).toHaveCount(2);
  });

  test("the Research 'Possible overlaps' filter keeps initiatives with a pair of that label", async ({ page }) => {
    await page.goto("/research?similar=any");
    await expect(resultCount(page)).toContainText(`${withLabel(null)} of ${N} initiatives`);
    await page.goto("/research?similar=complement");
    await expect(resultCount(page)).toContainText(`${withLabel("Possible complement")} of ${N} initiatives`);
    await page.goto("/research");
    const filters = isMobile(page) ? (await page.getByRole("button", { name: /^Filters/ }).click(), page.locator("#mobile-filters")) : page.getByRole("complementary", { name: "Filters" });
    await filters.getByLabel("Possible overlaps").selectOption("overlap");
    await expect(page).toHaveURL(/similar=overlap/);
    await expect(resultCount(page)).toContainText(`${withLabel("Possible overlap")} of ${N} initiatives`);
  });
});
