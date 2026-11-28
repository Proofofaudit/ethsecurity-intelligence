import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { byTitle, expectNoHorizontalOverflow } from "./helpers";

const PAGES = [
  "/",
  "/initiatives",
  `/initiatives/${byTitle[0]!.slug}`,
  "/initiatives?ids=" + byTitle.slice(0, 2).map((i) => i.slug).join(",") + "#compare",
  "/teams",
  "/workspace",
  "/about",
  "/dev",
];

test.describe("every key page", () => {
  for (const path of PAGES) {
    test(`${path} has no serious accessibility violations and no horizontal overflow`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).exclude(".react-flow__renderer").analyze();
      const serious = axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(
        serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`),
      ).toEqual([]);
    });
  }

  test("dark theme passes the same contrast checks", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("esi.theme", "dark"));
    for (const path of ["/", "/initiatives", `/initiatives/${byTitle[0]!.slug}`, "/dev"]) {
      await page.goto(path);
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      const axe = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
      expect(axe.violations.map((v) => `${path} ${v.id} (${v.nodes.length}) ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
    }
  });
});

test("internal links resolve without errors", async ({ page, request }, info) => {
  test.skip(info.project.name !== "desktop", "Links are the same at every width; checked once.");
  test.setTimeout(240_000);
  const seen = new Set<string>();
  for (const path of PAGES) {
    await page.goto(path);
    const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href") ?? ""));
    for (const h of hrefs) {
      if (!h.startsWith("/") || h.startsWith("//")) continue;
      seen.add(h.split("#")[0]!);
    }
  }
  seen.delete("");
  const broken: string[] = [];
  for (const href of seen) {
    const res = await request.get(href, { maxRedirects: 5 });
    if (res.status() >= 400) broken.push(`${href} -> ${res.status()}`);
  }
  expect(seen.size).toBeGreaterThan(80);
  expect(broken).toEqual([]);
});
