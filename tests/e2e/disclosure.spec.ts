import { expect, test, type Page } from "@playwright/test";
import { ADVANCED_VIEWS, PRIMARY_NAV, REFERENCE_PAGES } from "@/components/shell/nav";
import { BANNER_HREF, BANNER_TEXT, COI_ORGANIZATION_ID } from "@/lib/disclosure";
import { dataset, firstSlug } from "./helpers";

const poa = dataset.initiatives.find((i) => i.organizationId === COI_ORGANIZATION_ID)!;
const other = dataset.initiatives.find((i) => i.organizationId !== COI_ORGANIZATION_ID && i.organizationId)!;

const ROUTES = [
  ...[...PRIMARY_NAV, ...ADVANCED_VIEWS, ...REFERENCE_PAGES].map((p) => p.href),
  `/initiatives/${firstSlug}`,
  `/initiatives/${poa.slug}`,
  `/entities/organization/${encodeURIComponent(COI_ORGANIZATION_ID)}`,
];

/** The banner is present, complete, unclipped, not covered by anything and links to the disclosure. */
async function expectBanner(page: Page) {
  const banner = page.locator("[data-coi-banner]");
  await expect(banner).toHaveCount(1);
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(BANNER_TEXT);
  await expect(banner.locator(`a[href="${BANNER_HREF}"]`)).toHaveCount(1);
  const geometry = await banner.evaluate((el) => {
    const p = el.querySelector("p")!;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(p);
    // Modal dialogs set pointer-events: none on the page, which hit testing skips; restore it on
    // the banner only for the check, so the result reflects what is painted on top.
    const before = (el as HTMLElement).style.pointerEvents;
    (el as HTMLElement).style.pointerEvents = "auto";
    const hit = document.elementFromPoint(r.left + Math.min(40, r.width / 2), r.top + r.height / 2);
    (el as HTMLElement).style.pointerEvents = before;
    return {
      top: r.top + window.scrollY,
      width: r.width,
      viewport: document.documentElement.clientWidth,
      clipped: p.scrollWidth > p.clientWidth + 1 || s.textOverflow === "ellipsis" || s.whiteSpace === "nowrap",
      covered: !hit || !el.contains(hit),
      color: s.color,
      background: getComputedStyle(el).backgroundColor,
    };
  });
  expect(geometry.top, "banner sits at the top of the page").toBeLessThanOrEqual(1);
  expect(geometry.width).toBeGreaterThanOrEqual(geometry.viewport - 1);
  expect(geometry.clipped, "banner text wraps instead of truncating").toBe(false);
  expect(geometry.covered, "nothing covers the banner").toBe(false);
  expect(geometry.color).not.toBe(geometry.background);
}

test("the disclosure banner is on every route", async ({ page }) => {
  for (const route of ROUTES) {
    const res = await page.goto(route);
    expect(res?.status(), route).toBeLessThan(400);
    await expect(page.getByRole("heading", { level: 1 }).first(), route).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await expectBanner(page);
  }
});

test("the banner shows on the 404 page and in dark mode", async ({ page }) => {
  const res = await page.goto("/this-page-does-not-exist");
  expect(res?.status()).toBe(404);
  await expectBanner(page);

  await page.addInitScript(() => localStorage.setItem("esi.theme", "dark"));
  await page.goto("/research");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expectBanner(page);
});

test("the banner stays visible and uncovered with the command palette and dialogs open", async ({ page }) => {
  await page.goto("/");
  await page.locator("body").press("ControlOrMeta+k");
  await expect(page.getByPlaceholder("Search initiatives, organizations, claims and pages")).toBeVisible();
  await expectBanner(page);
  await page.keyboard.press("Escape");

  await page.goto(`/initiatives/${firstSlug}`);
  await page.getByRole("button", { name: "Suggest a correction", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Suggest a correction" })).toBeVisible();
  await expectBanner(page);
});

test("the source inspector repeats the disclosure, because it covers the page on narrow screens", async ({ page }) => {
  const claim = dataset.claims.find((c) => c.initiativeId === poa.id)!;
  await page.goto(`/initiatives/${poa.slug}#claim=${claim.id}`);
  const sheet = page.getByRole("dialog", { name: "Source inspector" });
  await expect(sheet).toBeVisible();
  const inline = sheet.locator("[data-coi-banner-inline]");
  await expect(inline).toBeVisible();
  await expect(inline).toContainText(BANNER_TEXT);
  await expect(inline.locator(`a[href="${BANNER_HREF}"]`)).toHaveCount(1);
  const box = await inline.boundingBox();
  expect(box!.y).toBeLessThanOrEqual(1);
});

test("the banner links to the conflict-of-interest section of About", async ({ page }) => {
  await page.goto("/research");
  await page.locator(`[data-coi-banner] a[href="${BANNER_HREF}"]`).click();
  await expect(page).toHaveURL(/\/about#coi$/);
  await expect(page.locator("#coi")).toBeVisible();
  await expect(page.locator("#coi")).toContainText("Proof of Audits");
});

test("the Proof of Audits dossier has a disclosure note and the same sections and correction link as others", async ({ page }) => {
  const SECTIONS = ["briefing", "problem", "exists", "requires", "team", "code", "financial", "milestones", "technical", "adoption", "dependencies", "similar", "supporting", "counter", "questions", "sources", "corrections", "history"];
  const outline = async (slug: string) => {
    await page.goto(`/initiatives/${slug}`);
    const present: string[] = [];
    for (const id of SECTIONS) if ((await page.locator(`article [id="${id}"] h2`).count()) === 1) present.push(id);
    const titles = await page.locator("article h2 span.text-md").allInnerTexts();
    await page.locator('article [id="corrections"] h2 button').click();
    const correction = page.getByRole("button", { name: "Suggest a correction to this dossier" });
    await expect(correction).toBeVisible();
    return {
      present,
      titles,
      correction: await correction.count(),
      log: await page.locator('article [id="corrections"] a[href="/corrections"]').count(),
      header: await page.getByRole("button", { name: "Suggest a correction", exact: true }).count(),
      note: await page.getByRole("complementary", { name: "Conflict of interest" }).count(),
    };
  };
  const a = await outline(poa.slug);
  await expect(page.getByRole("complementary", { name: "Conflict of interest" })).toContainText("same pipeline and rules as every other initiative");
  const b = await outline(other.slug);
  expect(a.note).toBe(1);
  expect(b.note).toBe(0);
  expect({ ...a, note: 0 }).toEqual({ ...b, note: 0 });
  expect(a.present).toEqual(SECTIONS);
  expect(a.correction).toBe(1);
  expect(a.log).toBe(1);
  expect(a.header).toBe(1);
});

test("lists default to the order labeled Alphabetical (neutral)", async ({ page }) => {
  await page.goto("/research");
  await expect(page.getByLabel("Sort")).toHaveValue("title");
  await expect(page.getByLabel("Sort").locator("option:checked")).toHaveText("Alphabetical (neutral)");
  await expect(page.getByText(/^Alphabetical \(neutral\): by official title/)).toBeVisible();
  await page.goto("/research/funding");
  await expect(page.getByText("Order: Alphabetical (neutral).")).toBeVisible();
});

test("a browsing session only contacts this origin", async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  const bodies: string[] = [];
  page.on("response", async (r) => {
    const type = r.headers()["content-type"] ?? "";
    if (/text\/(html|css)|javascript/.test(type)) bodies.push(await r.text().catch(() => ""));
  });

  for (const route of ["/", "/research", `/initiatives/${poa.slug}`, `/initiatives/${firstSlug}`, "/research/graph", "/workspace", "/lab", "/methodology", "/about"]) {
    await page.goto(route);
    await page.waitForLoadState("networkidle");
  }
  await page.goto("/research");
  await page.getByRole("searchbox", { name: "Search initiatives" }).fill("wallet");
  await expect(page).toHaveURL(/q=wallet/);
  await page.locator("body").press("ControlOrMeta+k");
  await page.getByPlaceholder("Search initiatives, organizations, claims and pages").fill("audit report");
  await page.waitForLoadState("networkidle");
  await page.keyboard.press("Escape");

  expect(requests.length).toBeGreaterThan(20);
  const foreign = requests.filter((u) => !u.startsWith("data:") && !u.startsWith("blob:") && new URL(u).origin !== origin);
  expect(foreign).toEqual([]);
  // Fonts are self-hosted by next/font at build time; nothing points at a font or analytics CDN.
  for (const b of bodies) expect(b).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com|googletagmanager|google-analytics/);
});
