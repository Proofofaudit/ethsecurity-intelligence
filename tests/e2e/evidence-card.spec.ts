import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { byTitle, dataset } from "./helpers";

const grant = byTitle.find((i) => i.type === "grant")!;
const rfp = byTitle.find((i) => i.type === "rfp")!;
const HEADINGS = ["Shipped work", "Funding", "Prior funding", "Team and track record", "Audits or reviews", "Not found"];

test.describe("Evidence card", () => {
  for (const ini of [grant, rfp]) {
    test(`appears at the top of the ${ini.type} dossier with the shared sections, and every fact has a link and a checked-on date`, async ({ page }) => {
      await page.goto(`/initiatives/${ini.slug}`);
      const card = page.getByTestId("evidence-card");
      await expect(card).toBeVisible();
      await expect(card.getByRole("heading", { level: 2 })).toHaveText("Evidence card");
      // Placed above the numbered dossier sections.
      const cardTop = (await card.boundingBox())!.y;
      const firstSection = (await page.locator("#briefing").boundingBox())!.y;
      expect(cardTop).toBeLessThan(firstSection);
      await expect(card.getByTestId("evidence-section").locator("h3")).toHaveText(HEADINGS);
      const facts = card.getByTestId("evidence-fact");
      const n = await facts.count();
      expect(n).toBeGreaterThan(3);
      for (let i = 0; i < n; i++) {
        const f = facts.nth(i);
        await expect(f.getByTestId("evidence-source")).toHaveAttribute("href", /^https?:\/\//);
        await expect(f.getByTestId("evidence-checked")).toContainText(/checked on \w{3} \d{1,2}, \d{4}/);
      }
      await expect(card).toContainText("Pledged (outstanding)");
      await expect(card).toContainText("Received pledges");
      await expect(card).toContainText("Donated (confirmed)");
      if (ini.type === "rfp") await expect(card).toContainText("No designated recipient");
    });
  }

  test("the Research list shows a compact evidence row per initiative", async ({ page }) => {
    await page.goto("/initiatives");
    const rows = page.getByTestId("evidence-row").filter({ visible: true });
    await expect(rows).toHaveCount(dataset.initiatives.length);
    await expect(rows.first()).toContainText("Evidence card");
    await expect(rows.first()).toContainText(/pledged \/ .* received \/ .* donated/);
    await expect(rows.first()).toContainText("Round 1:");
  });

  test("the dossier with the card has no serious accessibility violations", async ({ page }) => {
    await page.goto(`/initiatives/${grant.slug}`);
    await expect(page.getByTestId("evidence-card")).toBeVisible();
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).include("[data-testid=evidence-card]").analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
  });
});
