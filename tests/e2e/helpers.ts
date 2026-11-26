import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, type Page } from "@playwright/test";
import type { Dataset } from "@/lib/domain/schemas";
import { cohortMetrics } from "@/lib/metrics/compute";

/** The published dataset the server under test reads (file store, MONGODB_URI empty). */
export const dataset = JSON.parse(readFileSync(path.join(process.cwd(), "data", "published", "dataset.json"), "utf8")) as Dataset;
export const metrics = cohortMetrics(dataset);

export const byTitle = [...dataset.initiatives].sort((a, b) => a.title.localeCompare(b.title));
export const firstSlug = byTitle[0]!.slug;

export const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1440) < 768;

/** The value cell of a definition list entry, found by its label. */
export function statValue(page: Page, label: string) {
  return page.locator("dt", { hasText: new RegExp(`^${label}$`) }).locator("xpath=following-sibling::dd[1]");
}

/**
 * Fails when any visible element sticks out past the right edge of the viewport, except inside
 * containers that scroll or clip horizontally on purpose (wide tables, the graph canvas).
 */
export async function expectNoHorizontalOverflow(page: Page) {
  const offenders = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const clipped = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox === "auto" || ox === "scroll" || ox === "hidden" || ox === "clip") return true;
      }
      return false;
    };
    const out: string[] = [];
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > vw + 1 && !clipped(el)) {
        const s = getComputedStyle(el);
        if (s.position === "fixed" || s.visibility === "hidden") continue;
        out.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} right=${Math.round(r.right)}`);
      }
    }
    return { vw, out: out.slice(0, 5), scroll: document.documentElement.scrollWidth };
  });
  expect(offenders.out, `elements wider than the ${offenders.vw}px viewport`).toEqual([]);
  expect(offenders.scroll).toBeLessThanOrEqual(offenders.vw + 1);
}
