import { describe, expect, it } from "vitest";
import { activeFilterCount, parseParams, toFilter, toQuery } from "@/components/research/params";
import { loadPublishedDataset } from "@/lib/db/file-store";
import { FilterSchema, filterInitiatives, plainExplanation, searchClaims } from "@/lib/intelligence/service";

describe("research URL params", () => {
  it("parses, validates and round-trips every filter", () => {
    const p = parseParams({ q: "fuzz", cat: "opsec,defi", stage: "signing", type: "rfp", gmin: "1000", gmax: "x", fmin: "10", existing: "no", evidence: "yes", done: "no", integrations: "yes", adoption: "has", research: "complete", std: "ERC-7730", org: "org_a", sort: "goal", order: "desc", view: "cards" });
    expect(p.gmax).toBe("");
    expect(p.view).toBe("cards");
    const f = FilterSchema.parse(toFilter(p));
    expect(f).toMatchObject({ q: "fuzz", categories: ["opsec", "defi"], stages: ["signing"], type: "rfp", goalMinUsd: 1000, fundedMinPct: 10, existingWork: false, hasSupportedEvidence: true, hasCompletedMilestone: false, hasPlannedIntegrations: true, adoption: "has", researchComplete: true, standard: "ERC-7730", organizationId: "org_a", sort: "goal", order: "desc" });
    expect(parseParams(Object.fromEntries(new URLSearchParams(toQuery(p))))).toEqual(p);
    expect(activeFilterCount(p)).toBe(15);
  });

  it("ignores unknown values instead of failing", () => {
    const p = parseParams({ type: "loan", existing: "maybe", sort: "score" });
    expect(toFilter(p)).toEqual({ limit: 100 });
  });
});

describe("dossier helpers against the published dataset", () => {
  it("plain-language line is a verbatim prefix of every official summary", async () => {
    const d = await loadPublishedDataset();
    for (const i of d.initiatives) {
      const line = plainExplanation(i);
      expect(line.length).toBeGreaterThan(20);
      expect(i.summary.replace(/\s+/g, " ").trim().startsWith(line)).toBe(true);
    }
  });

  it("claim search requires every word and filters agree with URL params", async () => {
    const d = await loadPublishedDataset();
    const hits = searchClaims(d, "repository public", 50);
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) {
      const c = d.claims.find((x) => x.id === h.id);
      const text = `${c?.assertion} ${c?.quote ?? ""}`.toLowerCase();
      expect(text).toContain("repository");
      expect(text).toContain("public");
    }
    const rfp = filterInitiatives(d, FilterSchema.parse(toFilter(parseParams({ type: "rfp" }))));
    expect(rfp.total).toBe(d.initiatives.filter((i) => i.type === "rfp").length);
  });
});
