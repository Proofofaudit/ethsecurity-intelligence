import { existsSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { Dataset } from "@/lib/domain/schemas";
import config from "../../next.config";
import { REDIRECTS } from "@/lib/redirects";
import { loadPublishedDataset } from "@/lib/db/file-store";
import { asQuestion, questionsToCheck } from "@/lib/intelligence/questions-to-check";
import { isSubDollarNoise, meaningfulChanges } from "@/lib/intelligence/what-changed";
import { PRIMARY_NAV } from "@/components/shell/nav";

const ROOT = process.cwd();
const OLD = ["/research", "/research/compare", "/research/graph", "/research/coverage", "/research/questions", "/research/blind-spots", "/research/changes", "/research/what-if", "/research/milestones", "/research/funding", "/research/collaboration", "/lab", "/methodology", "/status", "/corrections"];

const hasPage = (route: string) => existsSync(path.join(ROOT, "app", route === "/" ? "" : route, "page.tsx"));

describe("route redirects", () => {
  it("covers every old route exactly once", () => {
    expect(REDIRECTS.map(([s]) => s).sort()).toEqual([...OLD].sort());
  });

  it("are permanent in next.config and keep /workspace/briefing out", async () => {
    const list = await config.redirects!();
    expect(list.map((r) => r.source).sort()).toEqual([...OLD].sort());
    for (const r of list) expect(r.permanent, r.source).toBe(true);
    expect(list.some((r) => r.source.startsWith("/workspace"))).toBe(false);
    expect(hasPage("/workspace/briefing")).toBe(true);
  });

  it("send every old route to a live page, and no old page is left behind", () => {
    for (const [source, destination] of REDIRECTS) {
      const dest = destination.split("#")[0]!;
      expect(hasPage(dest), `${source} -> ${destination}`).toBe(true);
      expect(hasPage(source), `${source} must not keep its own page`).toBe(false);
      expect(dest.startsWith("/research")).toBe(false);
    }
  });
});

describe("navigation", () => {
  it("has exactly the five tabs, without What-if or the developer page", () => {
    expect(PRIMARY_NAV.map((n) => [n.label, n.href])).toEqual([
      ["Home", "/"],
      ["Initiatives", "/initiatives"],
      ["Teams", "/teams"],
      ["My Ballot", "/workspace"],
      ["About", "/about"],
    ]);
    for (const n of PRIMARY_NAV) expect(n.href).not.toMatch(/what-if|\/lab|\/dev/);
  });
});

describe("Questions to check", () => {
  let d: Dataset;
  beforeAll(async () => {
    d = await loadPublishedDataset();
  });

  it("lists each question once per initiative and phrases every item as a question", () => {
    const list = questionsToCheck(d);
    expect(list.length).toBeGreaterThan(0);
    const keys = list.map((q) => `${q.initiativeId}|${q.question.toLowerCase()}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(list.map((q) => q.id)).size).toBe(list.length);
    for (const q of list) expect(q.question.trim().endsWith("?"), q.question).toBe(true);
  });

  it("keeps both sources", () => {
    const list = questionsToCheck(d);
    expect(list.some((q) => q.origin === "rule")).toBe(true);
    expect(list.some((q) => q.origin === "blind_spot")).toBe(true);
  });

  it("splits a statement from its question", () => {
    expect(asQuestion("Who maintains it?")).toEqual({ question: "Who maintains it?", context: null });
    expect(asQuestion("“M1” is an adoption milestone ($1, 10% of goal). Which parties must adopt it?")).toEqual({ question: "Which parties must adopt it?", context: "“M1” is an adoption milestone ($1, 10% of goal)." });
    expect(asQuestion("Brief criterion").question).toBe("Brief criterion?");
  });
});

describe("What changed", () => {
  const fund = (a: number, b: number) => ({ kind: "funding_changed" as const, before: { officialRaisedCents: a }, after: { officialRaisedCents: b } });

  it("hides funding changes under one dollar and keeps larger ones", () => {
    expect(isSubDollarNoise(fund(2005033, 2005049))).toBe(true);
    expect(isSubDollarNoise(fund(1750614, 1750616))).toBe(true);
    expect(isSubDollarNoise(fund(1832800, 1832898))).toBe(true);
    expect(isSubDollarNoise(fund(1000000, 1000100))).toBe(false);
    expect(isSubDollarNoise({ kind: "donation_added", before: null, after: { amountUsdCents: 5 } })).toBe(true);
    expect(isSubDollarNoise({ kind: "revision_added", before: 1, after: 2 })).toBe(false);
    expect(meaningfulChanges([fund(1, 2), fund(0, 500000)])).toHaveLength(1);
  });
});
