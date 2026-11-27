import { expect, test } from "@playwright/test";
import { dataset } from "./helpers";

const r1 = dataset.round1;
const linked = dataset.initiatives.find((i) => i.slug.startsWith("assertions-for-safes"))!;
const empty = dataset.initiatives.find((i) => (r1.initiativeMatches[i.id] ?? []).length === 0)!;
const record = r1.projects.find((p) => p.id === r1.initiativeMatches[linked.id]![0]!.projectId)!;

test.describe("Round 1 history", () => {
  test("a dossier shows the matched record with its source link, reason and checked-on date", async ({ page }) => {
    await page.goto(`/initiatives/${linked.slug}#round1`);
    const sec = page.getByTestId("round1-history");
    await expect(sec).toBeVisible();
    const rec = sec.getByTestId("round1-record").first();
    await expect(rec).toHaveAttribute("data-status", "match");
    await expect(rec.getByRole("link", { name: record.name })).toHaveAttribute("href", record.transparencyUrl);
    await expect(rec).toContainText("The proposal links to this Round 1 record");
    await expect(rec).toContainText("checked on");
    await expect(sec.getByTestId("round1-checked")).toContainText("checked on");
    await expect(sec).toContainText("Independent evidence");
    await expect(sec).not.toContainText(/\bfailed\b/i);
  });

  test("an initiative without a match shows the exact empty text", async ({ page }) => {
    await page.goto(`/initiatives/${empty.slug}#round1`);
    const sec = page.getByTestId("round1-history");
    await expect(sec.getByTestId("round1-empty")).toHaveText("No Round 1 funding found in the sources checked.");
    await expect(sec.getByTestId("round1-record")).toHaveCount(0);
  });

  test("an organization profile lists its Round 1 records", async ({ page }) => {
    const org = dataset.organizations.find((o) => o.id === "org_security-alliance-seal")!;
    await page.goto(`/entities/organization/${org.id}`);
    const sec = page.getByTestId("round1-history");
    await expect(sec.getByTestId("round1-record")).toHaveCount(r1.organizationMatches[org.id]!.length);
    await expect(sec).toContainText("SEAL 911");
  });
});
