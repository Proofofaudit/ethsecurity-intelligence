import { expect, test } from "@playwright/test";
import { formatPct, formatUsd } from "@/lib/util/money";
import { dataset, expectNoHorizontalOverflow, isMobile, metrics, statValue } from "./helpers";

const v = (id: string) => {
  const m = metrics[id];
  if (!m || m.value === null) throw new Error(`metric ${id} has no value`);
  return m.value;
};

test("overview figures equal the values computed from the published dataset", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(`${dataset.initiatives.length} initiatives`);
  expect(dataset.initiatives.length).toBe(55);
  expect(new Set(dataset.initiatives.map((i) => i.id)).size).toBe(55);

  await expect(statValue(page, "Qualified initiatives")).toHaveText(String(v("cohort.initiatives")));
  await expect(statValue(page, "Funding requested").first()).toHaveText(formatUsd(v("cohort.goal")));
  await expect(statValue(page, "Raised so far").first()).toHaveText(formatUsd(v("cohort.raised")));
  await expect(statValue(page, "Still needed").first()).toHaveText(formatUsd(v("cohort.remaining")));
  await expect(statValue(page, "Research coverage").first()).toHaveText(formatPct(v("cohort.research_coverage"), 0));

  // Funding identity: raised = outstanding pledges + received donations.
  expect(v("cohort.raised")).toBe(v("cohort.pledged_outstanding") + v("cohort.donated"));
  const grants = dataset.initiatives.filter((i) => i.type === "grant").length;
  await expect(page.getByText(`${grants} grants · ${dataset.initiatives.length - grants} RFPs`)).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("the four primary navigation items lead to their pages", async ({ page }) => {
  await page.goto("/");
  const targets = [
    { label: "Overview", url: /\/$/ },
    { label: "Research", url: /\/research$/ },
    { label: "My Workspace", url: /\/workspace$/ },
    { label: "AI Lab", url: /\/lab$/ },
  ];
  for (const t of [...targets.slice(1), targets[0]!]) {
    if (isMobile(page)) await page.getByRole("button", { name: "Menu" }).click();
    const nav = page.getByRole("navigation", { name: "Primary" });
    await expect(nav.getByRole("link")).toHaveCount(4);
    await nav.getByRole("link", { name: new RegExp(`^${t.label}`) }).click();
    await expect(page).toHaveURL(t.url);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});

test("theme choice switches to dark and persists across reloads", async ({ page }) => {
  await page.goto("/");
  const html = page.locator("html");
  const toggle = page.getByRole("button", { name: /^Theme:/ });
  for (let i = 0; i < 3; i++) {
    if ((await toggle.getAttribute("aria-label"))?.startsWith("Theme: Dark")) break;
    await toggle.click();
  }
  await expect(toggle).toHaveAttribute("aria-label", /^Theme: Dark/);
  await expect(html).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: /^Theme: Dark/ }).click();
  await page.getByRole("button", { name: /^Theme: System/ }).click();
  await expect(page.getByRole("button", { name: /^Theme: Light/ })).toBeVisible();
  await expect(html).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "light");
});

test("command palette opens from the keyboard and navigates", async ({ page }) => {
  await page.goto("/");
  await page.locator("body").press("ControlOrMeta+k");
  const input = page.getByPlaceholder("Search initiatives, organizations, claims and pages");
  await expect(input).toBeFocused();
  const target = dataset.initiatives.find((i) => i.shortTitle === "Blobscan") ?? dataset.initiatives[0]!;
  await input.fill(target.shortTitle);
  await expect(page.getByRole("option", { name: new RegExp(target.title.slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/initiatives/${target.slug}$`));

  await page.locator("body").press("ControlOrMeta+k");
  await input.fill("coverage map");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/research\/coverage$/);
  await page.locator("body").press("ControlOrMeta+k");
  await expect(input).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(input).toBeHidden();
});

test("keyboard-only navigation shows a visible focus indicator", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Tab");
    const style = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const s = getComputedStyle(el);
      return { tag: el.tagName, outline: s.outlineStyle, width: parseFloat(s.outlineWidth) };
    });
    expect(style, `focus target after ${i + 2} Tab presses`).not.toBeNull();
    expect(style!.outline).not.toBe("none");
    expect(style!.width).toBeGreaterThanOrEqual(2);
  }
  await page.goto("/");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toBeFocused();
});

test("unknown pages render the 404 page", async ({ page }) => {
  const res = await page.goto("/this-page-does-not-exist");
  expect(res?.status()).toBe(404);
  await expect(page.getByText("This page does not exist")).toBeVisible();
  const dossier = await page.goto("/initiatives/not-a-real-initiative");
  expect(dossier?.status()).toBe(404);
});
