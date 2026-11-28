import { expect, test, type Page } from "@playwright/test";
import { OPEN_QUESTION_NOTICE, openQuestionsFor, questionsAsText } from "@/lib/intelligence/service";
import { questionsToCheck } from "@/lib/intelligence/questions-to-check";
import { dataset, expectNoHorizontalOverflow } from "./helpers";

const subject = [...dataset.initiatives].filter((i) => i.type === "rfp").sort((a, b) => a.title.localeCompare(b.title, "en"))[0]!;
const expected = openQuestionsFor(dataset, subject.id)!;

/**
 * Requests after this call, except same-origin GETs that carry no user data: prefetches of linked
 * pages (?_rsc) and the app's own static script chunks.
 */
function watchNetwork(page: Page) {
  const seen: string[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    const sameOrigin = u.origin === new URL(page.url()).origin;
    if (sameOrigin && r.method() === "GET" && (u.searchParams.has("_rsc") || u.pathname.startsWith("/_next/static/"))) return;
    seen.push(`${r.method()} ${r.url()}`);
  });
  return seen;
}

test.describe("Open questions", () => {
  test("the dossier lists every rule-based question with category, rule, field and source link", async ({ page }) => {
    expect(expected.length).toBeGreaterThan(0);
    await page.goto(`/initiatives/${subject.slug}#questions`);
    const panel = page.getByTestId("open-questions");
    await expect(panel).toBeVisible();
    await expect(page.getByTestId("open-questions-notice")).toHaveText(OPEN_QUESTION_NOTICE);
    const rows = panel.getByTestId("open-question");
    await expect(rows).toHaveCount(expected.length);
    for (let i = 0; i < expected.length; i++) {
      const q = expected[i]!;
      const row = rows.nth(i);
      await expect(row).toHaveAttribute("data-category", q.category);
      await expect(row).toContainText(q.question);
      await expect(row).toContainText(`Rule ${q.ruleNumber}: ${q.ruleLabel}`);
      await expect(row).toContainText(q.field);
      await expect(row.getByRole("link", { name: q.sourceName })).toHaveAttribute("href", q.sourceUrl);
    }
    await expect(panel).toContainText("Who is expected to deliver?");
    await expectNoHorizontalOverflow(page);
  });

  test("Mark as asked or resolved persists across reload and makes no network request", async ({ page }) => {
    await page.goto(`/initiatives/${subject.slug}#questions`, { waitUntil: "networkidle" });
    const first = page.getByTestId("open-question").first();
    const box = first.getByTestId("open-question-mark");
    await expect(box).not.toBeChecked();
    const seen = watchNetwork(page);
    await box.check();
    await expect(first).toHaveAttribute("data-marked", "true");
    await expect(page.getByTestId("open-questions-marked")).toHaveText(`1 of ${expected.length} marked as asked or resolved`);
    await page.waitForTimeout(300);
    expect(seen).toEqual([]);
    const stored = await page.evaluate(() => JSON.parse(window.localStorage.getItem("esi.workspace") ?? "{}").openQuestions);
    expect(Object.keys(stored)).toEqual([expected[0]!.id]);
    await page.reload();
    await expect(page.getByTestId("open-question").first().getByTestId("open-question-mark")).toBeChecked();
    await page.getByTestId("open-question").first().getByTestId("open-question-mark").uncheck();
    await expect(page.getByTestId("open-question").first()).toHaveAttribute("data-marked", "false");
  });

  test("Copy as list puts the plain-text list on the clipboard", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(`/initiatives/${subject.slug}#questions`, { waitUntil: "networkidle" });
    const seen = watchNetwork(page);
    await page.getByTestId("open-questions").getByRole("button", { name: "Copy as list" }).click();
    await expect(page.getByTestId("open-questions").getByRole("button", { name: "Copied" })).toBeVisible();
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toBe(questionsAsText(subject.title, expected));
    expect(text).toContain(`1. ${expected[0]!.question} (${expected[0]!.category}; source: `);
    expect(seen).toEqual([]);
  });

  test("Questions to check merges open questions and blind spots, alphabetically, each phrased as a question", async ({ page }) => {
    const merged = questionsToCheck(dataset);
    await page.goto("/initiatives#questions");
    const list = page.getByTestId("questions-to-check");
    await expect(list).toBeVisible();
    await expect(page.locator("#questions")).toContainText("Counts are not a quality score");
    const names = await list.locator("summary span:first-child").allTextContents();
    expect(names).toEqual([...new Set(merged.map((q) => q.initiative))]);
    const total = await page.locator("#questions p[aria-live=polite]").innerText();
    expect(total.replace(/\D/g, "")).toBe(String(merged.length));
    // Same question never twice for one initiative; every item ends in a question mark.
    const keys = merged.map((q) => `${q.initiativeId}|${q.question.toLowerCase()}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const q of merged) expect(q.question.endsWith("?")).toBe(true);
    await expectNoHorizontalOverflow(page);
  });
});
