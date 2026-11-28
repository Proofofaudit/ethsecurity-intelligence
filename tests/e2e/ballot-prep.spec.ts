import { expect, test } from "@playwright/test";

const VOTE_APP = "https://initiatives.thedao.fund/vote";

test("My Ballot links to TheDAO and does not show a countdown or ballot-prep math", async ({ page }) => {
  await page.goto("/workspace");
  await expect(page.locator("[data-vote-calendar]")).toHaveCount(0);
  await expect(page.locator("[data-countdown]")).toHaveCount(0);
  await expect(page.locator("[data-ballot-prep]")).toHaveCount(0);
  await expect(page.locator("[data-thedao-status]").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the official vote app" }).first()).toHaveAttribute("href", VOTE_APP);
  await expect(page.getByText("TheDAO ask")).toHaveCount(0);
});

test("Home does not show a countdown or official funding figures", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("[data-vote-calendar]")).toHaveCount(0);
  await expect(page.locator("[data-countdown]")).toHaveCount(0);
  await expect(page.getByTestId("official-strip")).toHaveCount(0);
  await expect(page.locator("[data-thedao-status]")).toBeVisible();
});
