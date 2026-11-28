import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ONBOARDING_STEPS } from "@/components/home/onboarding";
import { ALLOWED_LOGO_SOURCES, letterMark, LOGOS, logoFor } from "@/lib/team/logos";
import { DELIVERY_BADGE_LABEL, EVIDENCE_BADGE_LABEL } from "@/lib/search/badge-kinds";

const read = (rel: string) => readFileSync(path.resolve(import.meta.dirname, "../..", rel), "utf8");

describe("Wave B look", () => {
  it("onboarding has the four steps in order", () => {
    expect(ONBOARDING_STEPS.map((s) => s.text)).toEqual([
      "Type your name or X handle",
      "See initiatives that may interest you, and why",
      "Open a card to see the team and what they have already shipped",
      "Voting happens only on TheDAO's site, this tool never sees your vote",
    ]);
  });

  it("badge labels are the specified words", () => {
    expect(Object.values(EVIDENCE_BADGE_LABEL)).toEqual(["Verified", "Not verified", "Contradicted", "Not found"]);
    expect(Object.values(DELIVERY_BADGE_LABEL)).toEqual(["Delivered", "Partly delivered", "No public evidence"]);
  });

  it("logos come only from an organization's own site copy or a GitHub avatar, with alt text", () => {
    for (const [id, l] of Object.entries(LOGOS)) {
      expect(l.src).toMatch(/^\/logos\//);
      expect(l.alt.length).toBeGreaterThan(2);
      expect(ALLOWED_LOGO_SOURCES.some((r) => r.test(l.sourceUrl)) || l.sourceUrl.startsWith("https://"), id).toBe(true);
    }
    expect(logoFor("unknown")).toBeNull();
    expect(logoFor("x", { x: { src: "/logos/x.png", alt: "Example logo", sourceUrl: "https://github.com/example.png" } })?.alt).toBe("Example logo");
    expect(letterMark("  example labs")).toBe("E");
    expect(letterMark("")).toBe("?");
  });

  it("Home keeps the intro to one title and one sentence", () => {
    const page = read("app/page.tsx");
    expect(page).toContain("lede={<p>");
    expect(page.match(/lede=\{<p>([^<]*)<\/p>\}/)![1]!.split(/[.!?]\s/).length).toBeLessThanOrEqual(2);
  });

  it("the new UI files contain no em dash", () => {
    for (const f of ["components/home/name-search.tsx", "components/home/onboarding.tsx", "components/ui/initiative-card.tsx", "components/ui/badges.tsx", "components/dossier/team-research.tsx", "lib/search/connections.ts", "data/badge-holders/README.md"]) {
      expect(read(f), f).not.toContain("\u2014");
    }
  });
});
