import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { byTitle, dataset, expectNoHorizontalOverflow } from "./helpers";

const VOTE_APP = "https://initiatives.thedao.fund/vote";
const sTally = dataset.vote.schedule!.firstTallyAt[0]! * 1000;
const fmt = (timeZone: string) => new Intl.DateTimeFormat("en-US", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone, timeZoneName: "short" }).format(sTally);

/** Records every request that is not a plain GET, and every request to another origin. */
function watchNetwork(page: Page) {
  const bad: string[] = [];
  page.on("request", (r) => {
    const sameOrigin = new URL(r.url()).origin === new URL(page.url() || "http://localhost:3100").origin;
    if (r.method() !== "GET" || !sameOrigin) bad.push(`${r.method()} ${r.url()}`);
  });
  return bad;
}

test.describe("Ballot Prep", () => {
  test("a draft persists after reload, checks update live, Clear removes it, nothing is sent", async ({ page }) => {
    await page.goto("/workspace");
    const prep = page.locator("[data-ballot-prep]");
    await expect(prep).toBeVisible();
    await expect(prep.getByText("Unofficial pre-check. The on-chain contract is final.")).toBeVisible();
    await expect(prep.locator("[data-ballot-item]")).toHaveCount(dataset.initiatives.length);
    await expect(prep.getByRole("link", { name: /Open official ballot/ })).toHaveAttribute("href", VOTE_APP);
    await expect(prep.locator("[data-official-quote]").first()).toContainText("S-Tier: must fund");
    await expect(prep.getByText("Be generous with B-tier; it only gets money after S and A.")).toBeVisible();

    const bad = watchNetwork(page);
    // Empty draft: the size rule fails with a fix line.
    await expect(prep.locator('[data-rule="1"]')).toHaveAttribute("data-ok", "false");
    await expect(prep.locator('[data-rule="1"] [data-fix]')).toContainText("Add initiatives to any tier until the asks total reaches");

    const picks = byTitle.slice(0, 3).map((i) => i.slug);
    for (const slug of picks) {
      const item = prep.locator(`[data-ballot-item="${slug}"]`);
      await item.getByRole("radio", { name: "S", exact: true }).click();
      await expect(item).toHaveAttribute("data-tier", "S");
    }
    await expect(prep.locator('[data-rule="2"]')).toBeVisible();

    await page.reload();
    const after = page.locator("[data-ballot-prep]");
    for (const slug of picks) await expect(after.locator(`[data-ballot-item="${slug}"]`)).toHaveAttribute("data-tier", "S");
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("esi.workspace") ?? "{}") as { ballotDraft?: { tiers: Record<string, string> } });
    expect(Object.values(stored.ballotDraft?.tiers ?? {})).toEqual(["S", "S", "S"]);

    page.once("dialog", (d) => void d.accept());
    await after.getByRole("button", { name: "Clear my draft" }).click();
    for (const slug of picks) await expect(after.locator(`[data-ballot-item="${slug}"]`)).toHaveAttribute("data-tier", "Off");
    expect(bad.filter((r) => !r.startsWith("GET "))).toEqual([]);
    expect(bad).toEqual([]);
    await expectNoHorizontalOverflow(page);
  });

  test("Export JSON holds the tiers and rule results only", async ({ page }) => {
    await page.goto("/workspace");
    const prep = page.locator("[data-ballot-prep]");
    const slug = byTitle[0]!.slug;
    await prep.locator(`[data-ballot-item="${slug}"]`).getByRole("radio", { name: "A", exact: true }).click();
    const [download] = await Promise.all([page.waitForEvent("download"), prep.getByRole("button", { name: "Export JSON" }).click()]);
    const body = JSON.parse(readFileSync(await download.path(), "utf8")) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["checks", "datasetVersion", "exportedAt", "format", "note", "poolMicroUsd", "tiers"]);
    expect(body.poolMicroUsd).toBe(dataset.vote.poolMicroUsd);
    expect((body.tiers as Record<string, { slug: string }[]>).A!.map((x) => x.slug)).toEqual([slug]);
  });
});

test.describe("Vote Calendar", () => {
  for (const path of ["/", "/workspace"]) {
    test(`strip on ${path} counts down to the S-tier tally from the manifest`, async ({ page }) => {
      await page.goto(path);
      const cal = page.locator("[data-vote-calendar]");
      await expect(cal).toBeVisible();
      await expect(cal).not.toHaveAttribute("data-fallback", "");
      // On Home the tally list is folded under one summary; open it.
      const folded = cal.locator("[data-calendar-details] summary");
      if (await folded.count()) await folded.click();
      await expect(cal.getByText("No ballot by the S-tier tally can lock you out of the round.")).toBeVisible();
      await expect(cal.getByRole("link", { name: /Open official vote app/ })).toHaveAttribute("href", VOTE_APP);
      await expect(cal.locator("[data-countdown]")).toHaveText(/^(\d+d \d{2}h \d{2}m|\d+h \d{2}m|\d+m)$/);
      await expect(cal.locator('[data-tz="utc"]')).toHaveText(fmt("UTC"));
      await expect(cal.locator('[data-tz="ist"]')).toHaveText(fmt("Asia/Kolkata"));
      await expect(cal.getByText("Ballots can be revised until their tier settles.", { exact: false })).toBeVisible();
      await expect(cal.getByText("Community funding until 31 Jan 2027")).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });
  }

  for (const timezoneId of ["Asia/Kolkata", "UTC", "America/Los_Angeles"]) {
    test.describe(`viewer in ${timezoneId}`, () => {
      test.use({ timezoneId });
      test("shows the tally in the viewer's local time", async ({ page }) => {
        await page.goto("/");
        await expect(page.locator('[data-vote-calendar] [data-tz="local"]')).toHaveText(fmt(timezoneId));
      });
    });
  }

  test("the data-freshness page says the countdown uses the manifest", async ({ page }) => {
    await page.goto("/about#freshness");
    await expect(page.getByText("From the manifest (schedule.firstTallyAt)")).toBeVisible();
  });
});

test.describe("Since last visit", () => {
  const target = byTitle.find((i) => i.funding.theDaoAskCents !== null)!;
  const asks = Object.fromEntries(dataset.initiatives.map((i) => [i.id, i.funding.theDaoAskCents]));

  test("first visit shows no deltas", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("[data-since-visit]")).toContainText("This is your first visit recorded in this browser.");
    await expect(page.locator("[data-ask-delta]")).toHaveCount(0);
  });

  test("a real change since the stored snapshot shows as ask down / ask up", async ({ page }) => {
    const seenAt = new Date(Date.now() - 3 * 3600_000).toISOString();
    const other = byTitle.find((i) => i.id !== target.id && i.funding.theDaoAskCents !== null && i.funding.theDaoAskCents >= 50_000)!;
    const seen = { datasetVersion: "older", at: seenAt, asks: { ...asks, [target.id]: target.funding.theDaoAskCents! + 100_000, [other.id]: other.funding.theDaoAskCents! - 50_000 } };
    await page.addInitScript((ws) => {
      if (!sessionStorage.getItem("seeded")) {
        localStorage.setItem("esi.workspace", ws);
        sessionStorage.setItem("seeded", "1");
      }
    }, JSON.stringify({ version: 1, funding: { seen, baseline: null } }));
    await page.goto("/");
    const box = page.locator("[data-since-visit]");
    await expect(box.locator("[data-ask-delta]")).toHaveCount(2);
    await expect(box.locator("li", { hasText: target.shortTitle })).toContainText("TheDAO ask down $1,000 since your last visit");
    await expect(box.locator("li", { hasText: other.shortTitle })).toContainText("TheDAO ask up $500 since your last visit");
    // A reload in the same visit keeps the comparison; My Workspace shows the same per-initiative delta.
    await page.reload();
    await expect(page.locator("[data-since-visit] [data-ask-delta]")).toHaveCount(2);
    await page.goto("/workspace");
    await expect(page.locator(`[data-ballot-item="${target.slug}"] [data-ask-delta="down"]`)).toHaveText("TheDAO ask down $1,000 since your last visit");
    const notifications = await page.evaluate(() => (typeof Notification === "undefined" ? "unsupported" : Notification.permission));
    expect(notifications === "default" || notifications === "unsupported" || notifications === "denied").toBe(true);
  });
});
