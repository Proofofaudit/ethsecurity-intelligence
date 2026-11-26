import { expect, test, type Page } from "@playwright/test";
import { dataset, expectNoHorizontalOverflow } from "./helpers";

const sealIds = Object.entries(dataset.vote.initiativeGroups)
  .filter(([, g]) => g.includes("SEAL"))
  .map(([id]) => id);
const sealSlugs = dataset.initiatives.filter((i) => sealIds.includes(i.id)).map((i) => i.slug);
const sealSlug = [...sealSlugs].sort()[0]!;
const wallets = dataset.initiatives.filter((i) => i.categories.some((c) => c.slug === "wallets-signing"));

/** Every request after this call. */
function recordRequests(page: Page) {
  const seen: string[] = [];
  page.on("request", (r) => seen.push(`${r.method()} ${r.url()}`));
  return seen;
}

/**
 * Requests other than same-origin page GETs. Next.js prefetches linked pages with GET, which is
 * allowed; anything else (another origin, the API, a POST) would mean local input left the browser.
 */
const unexpected = (requests: string[], page: Page) => {
  const origin = new URL(page.url()).origin;
  return requests.filter((r) => !r.startsWith(`GET ${origin}/`) || r.startsWith(`GET ${origin}/api/`));
};

test.describe("My affiliations", () => {
  test("SEAL entry flags SEAL initiatives, overrides persist after reload, nothing is sent", async ({ page }) => {
    await page.goto("/workspace");
    const sec = page.locator("[data-affiliations]");
    await expect(sec).toBeVisible();
    const requests = recordRequests(page);

    await sec.locator("[data-affiliation-input]").fill("Security Alliance (SEAL)");
    await sec.getByRole("button", { name: "Add", exact: true }).click();
    await expect(sec.locator('[data-affiliation-entry="Security Alliance (SEAL)"]')).toBeVisible();
    for (const slug of sealSlugs) await expect(sec.locator(`[data-affiliation-item="${slug}"]`)).toHaveAttribute("data-state", "matched");
    await expect(sec.locator("[data-affiliation-item]")).toHaveCount(sealSlugs.length);
    await expect(sec.locator(`[data-affiliation-item="${sealSlug}"]`)).toContainText("You may be affiliated");
    await expect(sec.locator(`[data-affiliation-item="${sealSlug}"]`)).toContainText("matched manifest affiliation group “SEAL”");

    // Ballot Prep shows the flag next to the tier choice, with the S-tier reminder; nothing is hidden.
    const prep = page.locator("[data-ballot-prep]");
    await expect(prep.locator("[data-ballot-item]")).toHaveCount(dataset.initiatives.length);
    await expect(prep.locator(`[data-ballot-item="${sealSlug}"]`)).toContainText("Possibly your own or affiliated");
    await expect(prep.locator("[data-s-tier-reminder]")).toContainText("TheDAO's ballot rules limit affiliated initiatives in S-tier");
    await expect(prep.locator(`[data-ballot-item="${sealSlug}"] [data-affiliated-with]`)).toContainText("Affiliated with:");

    // A generic entry matches nothing.
    await sec.locator("[data-affiliation-input]").fill("Ethereum Foundation");
    await sec.getByRole("button", { name: "Add", exact: true }).click();
    await expect(sec.locator("[data-affiliation-item]")).toHaveCount(sealSlugs.length);

    // Manual overrides.
    await sec.locator(`[data-affiliation-item="${sealSlug}"]`).getByRole("button", { name: "Not affiliated" }).click();
    await expect(sec.locator(`[data-affiliation-item="${sealSlug}"]`)).toHaveAttribute("data-state", "dismissed");
    const other = [...dataset.initiatives].filter((i) => !sealIds.includes(i.id)).sort((a, b) => a.shortTitle.localeCompare(b.shortTitle))[0]!;
    await sec.getByRole("combobox", { name: "Mark an initiative as affiliated" }).fill(other.shortTitle);
    await page.keyboard.press("Enter");
    await expect(sec.locator(`[data-affiliation-item="${other.slug}"]`)).toHaveAttribute("data-state", "marked");

    await page.reload();
    const after = page.locator("[data-affiliations]");
    await expect(after.locator(`[data-affiliation-item="${sealSlug}"]`)).toHaveAttribute("data-state", "dismissed");
    await expect(after.locator(`[data-affiliation-item="${other.slug}"]`)).toHaveAttribute("data-state", "marked");
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("esi.workspace") ?? "{}") as { affiliations?: { entries: string[]; overrides: Record<string, string> } });
    expect(stored.affiliations?.entries).toEqual(["Security Alliance (SEAL)", "Ethereum Foundation"]);
    expect(Object.values(stored.affiliations?.overrides ?? {}).sort()).toEqual(["mine", "not_mine"]);

    // Dossier shows the personal tag and the official shared-group line.
    await page.goto(`/initiatives/${other.slug}`);
    await expect(page.locator("[data-affiliation-flag]")).toHaveAttribute("data-affiliation-flag", "marked");
    await page.goto(`/initiatives/${sealSlugs.find((s) => s !== sealSlug)!}`);
    await expect(page.locator("[data-affiliation-flag]")).toContainText("You may be affiliated");
    await expect(page.locator("[data-affiliated-with]").first()).toContainText("Affiliated with:");

    expect(unexpected(requests, page)).toEqual([]);
  });

  test("public-profile lookup is off with an honest note, and typing makes no network request", async ({ page }) => {
    await page.goto("/workspace");
    const box = page.locator("[data-public-profile]");
    await expect(box).toHaveAttribute("data-enabled", "false");
    await expect(box.locator("[data-public-profile-note]")).toContainText("this site does not compile one");
    await expect(box.locator("[data-public-profile-input]")).toBeDisabled();
    await expect(box.locator("[data-public-profile-input]")).toHaveAttribute("placeholder", /DeFi auditor/);
    const requests = recordRequests(page);
    // Typing affiliations and keywords runs locally.
    await page.locator("[data-affiliation-input]").pressSequentially("Nether");
    await page.locator("[data-interest-keyword-input]").pressSequentially("fuzz");
    await page.waitForTimeout(500);
    // Only Next.js link prefetches (same-origin page GETs) may run; none carries the typed text.
    expect(unexpected(requests, page)).toEqual([]);
    expect(requests.filter((r) => /nether|fuzz/i.test(r))).toEqual([]);
  });
});

test.describe("May interest you", () => {
  test("focus chips render grouped items with reasons and evidence links, alphabetically, and persist", async ({ page }) => {
    await page.goto("/workspace");
    const sec = page.locator("[data-may-interest]");
    await expect(sec).toBeVisible();
    await expect(sec.getByText("Pick a focus or add a keyword")).toBeVisible();
    const requests = recordRequests(page);

    await sec.locator('[data-focus-chip="Wallets & Signing"]').click();
    const group = sec.locator('[data-interest-group="cat:wallets-signing"]');
    await expect(group.locator("[data-interest-item]")).toHaveCount(wallets.length);
    const labels = await group.locator("[data-interest-item] > a").allTextContents();
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
    for (const item of await group.locator("[data-interest-item]").all()) {
      await expect(item.locator("[data-interest-reason]").first()).toContainText("Matches your selected focus: Wallets & Signing");
      await expect(item.locator('[data-evidence-link="official"]')).toHaveAttribute("href", /^https:\/\/initiatives\.thedao\.fund\/initiative\//);
    }
    // The results carry no score, rank or percentage (the intro sentence says "No ranking, score or advice").
    await expect(group).not.toContainText(/score|rank|%/i);

    await sec.locator("[data-interest-keyword-input]").fill("fuzzing");
    await sec.getByRole("button", { name: "Add", exact: true }).click();
    const kw = sec.locator('[data-interest-group="kw:fuzzing"]');
    await expect(kw).toBeVisible();
    await expect(kw.locator("[data-interest-reason]").first()).toContainText("This may interest you because the official");
    expect(unexpected(requests, page)).toEqual([]);

    await page.reload();
    await expect(page.locator('[data-interest-group="cat:wallets-signing"] [data-interest-item]')).toHaveCount(wallets.length);
    await expect(page.locator('[data-interest-group="kw:fuzzing"]')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
