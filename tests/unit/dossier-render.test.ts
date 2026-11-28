import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BadgeRow } from "@/components/ui/badges";
import { Sparkline, sparklineAlt } from "@/components/ui/charts";
import { TooltipProvider } from "@/components/ui/overlay";
import { TeamResearchSection } from "@/components/dossier/team-research";
import type { TeamResearchResult } from "@/lib/team/types";

const researched: TeamResearchResult = {
  researched: true,
  data: {
    initiativeId: "fixture",
    members: [
      {
        name: "Alex Example",
        role: "Engineer",
        handles: [{ platform: "X", handle: "@example_alex", url: "https://x.com/example_alex" }],
        pastWork: [{ label: "Example Tool", url: "https://github.com/example/tool", checkedOn: "2026-11-01" }],
        githubMonthlyCommits: [1, 0, 3, 4, 0, 0, 2, 5, 1, 0, 0, 7],
        checkedOn: "2026-11-01",
      },
      { name: "Sam Sample", role: "", handles: [], pastWork: [], githubMonthlyCommits: [], checkedOn: "2026-11-01" },
    ],
    organization: null,
    deliveryTimeline: [
      { grant: "Example Grant", funder: "Example Fund", promised: "A tool", status: "Partly delivered", sources: [{ label: "Repo", url: "https://github.com/example/tool" }], checkedOn: "2026-11-01" },
      { grant: "Other Grant", funder: "Example Fund", promised: "A report", status: "No public evidence", sources: [], checkedOn: "2026-11-01" },
    ],
    claimChecks: [{ claim: "Shipped a tool", status: "Contradicted by source", sources: [], checkedOn: "2026-11-01" }],
    questions: [],
  },
};

const html = (r: TeamResearchResult) => renderToStaticMarkup(createElement(TooltipProvider, null, createElement(TeamResearchSection, { research: r })));

describe("dossier research rendering", () => {
  it("shows Not yet researched when no research exists", () => {
    expect(html({ researched: false, reason: "Not researched yet" })).toContain("Not yet researched");
  });

  it("renders team cards, delivery timeline, claim badges and a sparkline with text alternatives", () => {
    const out = html(researched);
    expect(out).toContain("Alex Example");
    expect(out).toContain("Partly delivered");
    expect(out).toContain("No public evidence");
    expect(out).toContain("Contradicted");
    expect(out).toContain(sparklineAlt(researched.researched ? researched.data.members[0]!.githubMonthlyCommits : []));
    expect(out).toContain("What is this? GitHub activity, 12 months");
    expect(out).toContain("Not found in public sources");
    expect(out).not.toMatch(/\brank|score|stars?\b/i);
  });

  it("every svg chart is an img with a label", () => {
    const svg = renderToStaticMarkup(createElement(Sparkline, { values: [1, 2, 3] }));
    expect(svg).toContain('role="img"');
    expect(svg).toContain("aria-label=");
    expect(renderToStaticMarkup(createElement(Sparkline, { values: [] }))).toContain("Not found in public sources");
  });

  it("badge rows pair text with an icon and say Not yet researched without research", () => {
    expect(renderToStaticMarkup(createElement(BadgeRow, { evidence: null, delivery: null }))).toContain("Not yet researched");
    const row = renderToStaticMarkup(createElement(BadgeRow, { evidence: [{ kind: "verified", count: 2 }, { kind: "not_found", count: 1 }], delivery: [{ kind: "delivered", count: 1 }] }));
    for (const t of ["Verified", "Not found", "Delivered"]) expect(row).toContain(t);
    expect(row.match(/<svg/g)?.length).toBe(3);
  });
});
