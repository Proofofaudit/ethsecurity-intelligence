import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { byTitle, expectNoHorizontalOverflow } from "./helpers";

test("saved initiatives persist in My Workspace across reloads", async ({ page }) => {
  const ini = byTitle[0]!;
  await page.goto(`/initiatives/${ini.slug}`);
  const add = page.getByRole("button", { name: `Save ${ini.shortTitle} to My Workspace` }).first();
  await add.click();
  await expect(page.getByRole("button", { name: `Saved: remove ${ini.shortTitle} from My Workspace` }).first()).toHaveAttribute("aria-pressed", "true");

  await page.goto("/workspace");
  const saved = page.locator("section", { has: page.getByRole("heading", { name: /Saved for later/ }) });
  await expect(saved.getByRole("link", { name: ini.shortTitle, exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(saved.getByRole("link", { name: ini.shortTitle, exact: true }).first()).toBeVisible();
  const stored = await page.evaluate(() => localStorage.getItem("esi.workspace"));
  expect(stored).toContain(ini.id);
  await expectNoHorizontalOverflow(page);
});

test("Developer page buttons download the skill file and the JSON configuration", async ({ page }) => {
  await page.goto("/dev");
  const skill = page.getByRole("button", { name: "Download SKILL.md" });
  await expect(skill).toBeEnabled();
  const [md] = await Promise.all([page.waitForEvent("download"), skill.click()]);
  expect(md.suggestedFilename()).toBe("SKILL.md");
  const mdText = readFileSync(await md.path(), "utf8");
  expect(mdText).toMatch(/^---\nname: /);
  expect(mdText).toContain("55");

  const [json] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download JSON configuration" }).click()]);
  expect(json.suggestedFilename()).toMatch(/\.config\.json$/);
  const config = JSON.parse(readFileSync(await json.path(), "utf8")) as Record<string, unknown>;
  expect(config).toHaveProperty("scope");

  const bundle = page.getByRole("link", { name: "Export evidence bundle" });
  const href = await bundle.getAttribute("href");
  expect(href).toMatch(/^\/api\/v1\/export/);
  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  await expectNoHorizontalOverflow(page);
});
