/** Pages must not render a countdown, a funding chart, or a raised/pledged/goal/ask figure. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InitiativeCard } from "@/components/ui/initiative-card";
import type { CardData } from "@/lib/search/card-data";

const read = (rel: string) => readFileSync(path.resolve(import.meta.dirname, "../..", rel), "utf8");

const PAGES = ["app/page.tsx", "app/initiatives/page.tsx", "app/initiatives/[slug]/page.tsx", "app/workspace/page.tsx", "app/teams/page.tsx", "app/layout.tsx", "components/workspace/view.tsx", "components/ui/initiative-card.tsx", "components/research/explorer.tsx"];

describe("no duplicate live TheDAO data", () => {
  it("page sources do not mount a countdown, funding bar, or TheDAO ask figure", () => {
    for (const file of PAGES) {
      const src = read(file);
      expect(src, file).not.toContain("data-countdown");
      expect(src, file).not.toContain("FundingBar");
      expect(src, file).not.toContain("VoteCalendar");
      expect(src, file).not.toContain("WhatIfLab");
      expect(src, file).not.toContain("StaleBanner");
    }
  });

  it("an initiative card links to TheDAO and does not draw a funding chart", () => {
    const card: CardData = {
      id: "i",
      slug: "example",
      title: "Example",
      shortTitle: "Example",
      displayTitle: "Example",
      organization: "Example Labs",
      officialUrl: "https://initiatives.thedao.fund/example",
      evidence: [{ kind: "not_found", count: 1 }],
      delivery: [{ kind: "none", count: 1 }],
      affiliatedWith: [],
      logo: null,
    };
    const html = renderToStaticMarkup(createElement(InitiativeCard, { card }));
    expect(html).toContain("View on TheDAO");
    expect(html).toContain("https://initiatives.thedao.fund/example");
    expect(html).toContain("https://initiatives.thedao.fund/vote");
    expect(html).not.toMatch(/TheDAO ask|\$[0-9]|still needed|data-countdown/i);
  });
});
