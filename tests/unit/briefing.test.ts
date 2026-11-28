/**
 * 10-minute briefing (Item 12): deterministic timing, the fixed section order for grants and RFPs,
 * link types from URL structure only, a source link on every item, omission of missing items,
 * neutral wording, the alphabetical focus chain and the local read mark.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { EMPTY_WORKSPACE, parseImport, setBriefingReadMark, exportWorkspace, WorkspaceSchema } from "@/components/workspace/schema";
import { loadPublishedDataset } from "@/lib/db/file-store";
import type { Dataset } from "@/lib/domain/schemas";
import {
  BRIEFING_MINUTES,
  BRIEFING_NOTE,
  buildBriefing,
  chainOrder,
  chainTotalMinutes,
  classifyLink,
  focusInitiativeIds,
  LINK_TYPE_LABEL,
  OPTIONAL_RULE,
  READING_TIME_RULE,
  readingMinutes,
  wordCount,
  type BriefingInput,
} from "@/lib/intelligence/briefing";
import { briefingFor } from "@/lib/intelligence/service";
import { findBannedPhrases } from "@/lib/neutralLanguage";
import { mayInterest, type FocusId } from "@/lib/vote/interest";
import { interestView } from "@/lib/vote/view-data";

const ROOT = path.resolve(import.meta.dirname, "../..");
let d: Dataset;
beforeAll(async () => {
  d = await loadPublishedDataset();
});

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");
function input(over: Partial<BriefingInput["initiative"]> = {}, rest: Partial<BriefingInput> = {}): BriefingInput {
  return {
    initiative: { id: "i1", slug: "s1", title: "T", url: "https://initiatives.thedao.fund/initiative/s1", summary: "One sentence.", sections: [], links: [], textLinks: [], ...over },
    milestones: [],
    round1: [],
    card: [],
    possibleText: "Possible match: please verify",
    ...rest,
  };
}
const sec = (key: string, n = 10) => ({ key, heading: `H ${key}`, markdown: words(n) });

describe("reading time", () => {
  it("counts words and rounds up to whole minutes with a 1-minute minimum", () => {
    expect([0, 1, 200, 201, 400, 401].map(readingMinutes)).toEqual([1, 1, 1, 2, 2, 3]);
    expect(readingMinutes(wordCount(words(200)))).toBe(1);
    expect(readingMinutes(wordCount(words(201)))).toBe(2);
  });
  it("ignores markdown syntax and counts a link by its text and a bare URL as one word", () => {
    expect(wordCount("## Heading here\n- **bold** item\n1. [two words](https://x.org/a/b) and https://y.org/z")).toBe(8);
    expect(wordCount("--- ***")).toBe(0);
  });
  it("states the rule in plain words", () => {
    expect(READING_TIME_RULE).toMatch(/200 words per minute, rounded up to whole minutes, with a minimum of 1 minute per item/);
  });
});

describe("link types", () => {
  const cases: [string, string][] = [
    ["https://github.com/BlossomLabs/Assertions", "repo"],
    ["https://github.com/ethereum-optimism/superchain-ops/tree/main/src/tasks", "repo"],
    ["https://github.com/sembrestels", "link"],
    ["https://github.com/orgs/foo/people", "link"],
    ["https://github.com/foo/bar/tree/main/audits", "audit"],
    ["https://github.com/foo/audits", "repo"],
    ["https://github.com/foo/security-review-tool", "repo"],
    ["https://example.org/reports/Acme-audit-2026.pdf", "audit"],
    ["https://example.org/audits/acme", "audit"],
    ["https://docs.example.org/intro", "docs"],
    ["https://example.org/docs/start", "docs"],
    ["https://foo.readthedocs.io/en/latest/", "docs"],
    ["https://demo.example.org/x", "demo"],
    ["https://example.org/demo", "demo"],
    ["https://assertions.eth.limo", "website"],
    ["https://blossom.software/", "website"],
    ["https://www.example.org", "website"],
    ["https://example.org/blog/post", "link"],
    ["https://x.com/someone", "link"],
    ["https://x.com/", "link"],
    ["https://etherscan.io/tx/0xabc", "link"],
    ["not a url", "link"],
    ["ftp://example.org/", "link"],
  ];
  it.each(cases)("%s is %s", (url, type) => expect(classifyLink(url)).toBe(type));
  it("uses only the five named types and Link", () => {
    expect(Object.values(LINK_TYPE_LABEL).sort()).toEqual(["Audit", "Demo", "Docs", "Link", "Repo", "Website"]);
  });
  it("does not use link text: the same address gets the same type", () => {
    const b = buildBriefing(input({ links: [], textLinks: [{ url: "https://x.org/post", text: "Audit report", section: "why" }, { url: "https://example.org/", text: "Source code repository", section: "why" }] }));
    const links = b.items.find((i) => i.key === "links")!.body;
    expect(links.type === "links" && links.links.map((l) => l.type)).toEqual(["link", "website"]);
  });
});

describe("order, omission and timing (synthetic)", () => {
  it("orders a grant: summary, why, in_scope, out_scope, milestones, commitments, team, links", () => {
    const b = buildBriefing(
      input(
        { sections: ["team", "commitments", "out_scope", "in_scope", "why", "why_grant"].map((k) => sec(k)), links: ["https://example.org"] },
        { milestones: [{ index: 0, name: "M one", criteria: ["Shipped"], link: null }] },
      ),
    );
    expect(b.items.map((i) => i.key)).toEqual(["summary", "why", "in_scope", "out_scope", "milestones", "commitments", "team", "links"]);
    expect(b.otherSections.map((s) => s.key)).toEqual(["why_grant"]);
  });
  it("orders an RFP with existing, who and hard_req in the later positions", () => {
    const b = buildBriefing(input({ sections: ["hard_req", "who", "existing", "out_scope", "in_scope", "why"].map((k) => sec(k)) }, { milestones: [{ index: 0, name: "M", criteria: [], link: null }] }));
    expect(b.items.map((i) => i.key)).toEqual(["summary", "why", "in_scope", "out_scope", "milestones", "existing", "who", "hard_req"]);
  });
  it("omits missing items instead of filling them", () => {
    const b = buildBriefing(input({ summary: "  ", sections: [sec("why"), { key: "team", heading: "Team", markdown: " " }] }));
    expect(b.items.map((i) => i.key)).toEqual(["why"]);
    expect(buildBriefing(input({}, { round1: [], card: [{ title: "Funding", items: [] }] })).items.map((i) => i.key)).toEqual(["summary"]);
  });
  it("adds Round 1 and the Evidence card only when they have data", () => {
    const b = buildBriefing(
      input(
        {},
        {
          round1: [{ name: "P", status: "possible", totalEth: "1.5000", progressUpdateUrl: "https://x.com/u/status/1", transparencyUrl: "https://thedao.fund/transparency/p" }],
          card: [{ title: "Funding", items: [{ label: "Official goal", value: "$10", link: null, sourceName: "TheDAO API record", sourceLabel: "Official data", sourceUrl: "https://initiatives.thedao.fund/api/x", checkedAt: "2026-11-26T13:08:48.235Z" }] }],
        },
      ),
    );
    expect(b.items.map((i) => i.key)).toEqual(["summary", "round1", "evidence_card"]);
    const r1 = b.items[1]!.body;
    expect(r1.type === "lines" && r1.lines.map((l) => l.text)).toEqual(["P", "Possible match: please verify", "Total received in Round 1: 1.5000 ETH", "Progress update"]);
    expect(b.items[1]!.sources).toEqual([{ label: "Round 1 record", url: "https://thedao.fund/transparency/p" }]);
  });
  it("drops an item with no https source", () => {
    expect(buildBriefing(input({ url: "http://insecure.example.org/x" })).items).toEqual([]);
  });
  it("sums rounded item times and marks items after the 10-minute mark Optional", () => {
    // 4 + 4 + 3 = 11 minutes by the end of in_scope; why starts at 1 (summary), in_scope at 5, out_scope at 9, milestones at 12.
    const b = buildBriefing(input({ sections: [sec("why", 700), sec("in_scope", 700), sec("out_scope", 401), sec("commitments", 5)] }));
    expect(b.items.map((i) => [i.key, i.minutes, i.startMinute, i.optional])).toEqual([
      ["summary", 1, 0, false],
      ["why", 4, 1, false],
      ["in_scope", 4, 5, false],
      ["out_scope", 3, 9, false],
      ["commitments", 1, 12, true],
    ]);
    expect(b.totalMinutes).toBe(13);
    expect(b.coreMinutes).toBe(12);
    expect(b.optionalCount).toBe(1);
    expect(b.totalMinutes).toBe(b.items.reduce((n, i) => n + i.minutes, 0));
  });
  it("marks nothing Optional when the item that crosses minute 10 is last", () => {
    expect(buildBriefing(input({ sections: [sec("why", 1900)] })).items.some((i) => i.optional)).toBe(false);
    expect(OPTIONAL_RULE).toContain(String(BRIEFING_MINUTES));
  });
  it("gives the same result for the same input", () => {
    const i = input({ sections: [sec("why", 321), sec("team", 50)], links: ["https://github.com/a/b"] });
    expect(buildBriefing(i)).toEqual(buildBriefing(i));
  });
});

describe("briefing for the published dataset", () => {
  it("builds for all 55 initiatives with the same template", () => {
    expect(d.initiatives).toHaveLength(55);
    for (const ini of d.initiatives) {
      const b = briefingFor(d, ini.id)!;
      const keys = b.items.map((i) => i.key);
      expect(keys.slice(0, 5), ini.slug).toEqual(["summary", "why", "in_scope", "out_scope", "milestones"]);
      expect(keys.slice(5).filter((k) => k !== "links" && k !== "round1" && k !== "evidence_card")).toEqual(ini.type === "rfp" ? ["existing", "who", "hard_req"] : ["commitments", "team"]);
    }
  });
  it("every item has an https source link and a unique stable id", () => {
    for (const ini of d.initiatives) {
      const b = briefingFor(d, ini.id)!;
      const ids = b.items.map((i) => i.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const it of b.items) {
        expect(it.id).toBe(`${ini.id}:${it.key}`);
        expect(it.sources.length, `${ini.slug} ${it.key}`).toBeGreaterThan(0);
        for (const s of it.sources) expect(s.url).toMatch(/^https:\/\//);
      }
    }
  });
  it("quotes official section text verbatim and computes times from words / 200", () => {
    for (const ini of d.initiatives) {
      const b = briefingFor(d, ini.id)!;
      for (const it of b.items) {
        expect(it.minutes).toBe(Math.max(1, Math.ceil(it.words / 200)));
        if (it.kind === "section") expect(it.body).toEqual({ type: "markdown", markdown: ini.sections.find((s) => s.key === it.key)!.markdown });
        if (it.kind === "summary") expect(it.body).toEqual({ type: "markdown", markdown: ini.summary });
      }
      expect(b.totalMinutes).toBe(b.items.reduce((n, i) => n + i.minutes, 0));
      let start = 0;
      for (const it of b.items) {
        expect(it.startMinute).toBe(start);
        expect(it.optional).toBe(start >= 10);
        start += it.minutes;
      }
    }
  });
  it("lists Round 1 and the Evidence card only when the data has records or items", () => {
    for (const ini of d.initiatives) {
      const keys = briefingFor(d, ini.id)!.items.map((i) => i.key);
      expect(keys.includes("round1")).toBe((d.round1.initiativeMatches[ini.id] ?? []).length > 0);
    }
    expect(d.initiatives.some((i) => !briefingFor(d, i.id)!.items.some((x) => x.key === "round1"))).toBe(true);
  });
  it("is identical across calls (no clock, no randomness)", () => {
    const a = d.initiatives.map((i) => briefingFor(d, i.id));
    const b = d.initiatives.map((i) => briefingFor(d, i.id));
    expect(a).toEqual(b);
  });
  it("shows no generated prose: only quoted text, recorded facts and fixed labels", () => {
    const src = readFileSync(path.join(ROOT, "lib/intelligence/briefing.ts"), "utf8");
    expect(src).not.toMatch(/fetch\(|Math\.random|Date\.now|new Date\(\)/);
  });
});

describe("neutral wording", () => {
  it("fixed texts contain no banned or ranking phrases", () => {
    for (const t of [READING_TIME_RULE, OPTIONAL_RULE, BRIEFING_NOTE, ...Object.values(LINK_TYPE_LABEL)]) expect(findBannedPhrases(t), t).toEqual([]);
    expect(`${READING_TIME_RULE} ${OPTIONAL_RULE} ${BRIEFING_NOTE}`).not.toMatch(/\b(best|top|recommend|must read|important|worth|should|safe|risky|score|rank)/i);
  });
  it("text we assemble (Round 1 and Evidence card lines, link titles) passes the filter on every initiative", () => {
    for (const ini of d.initiatives) {
      for (const it of briefingFor(d, ini.id)!.items) {
        if (it.body.type !== "lines" || !["round1", "evidence_card"].includes(it.kind)) continue;
        for (const l of it.body.lines) expect(findBannedPhrases(l.text), `${ini.slug}: ${l.text}`).toEqual([]);
      }
    }
  });
  it("the source files carry no ranking words", () => {
    for (const f of ["lib/intelligence/briefing.ts", "components/dossier/briefing.tsx", "components/dossier/briefing-chain.tsx"]) {
      const text = readFileSync(path.join(ROOT, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      expect(findBannedPhrases(text.replace(/^\s*\/\/.*$/gm, "")), f).toEqual([]);
    }
  });
});

describe("focus chain", () => {
  it("lists each initiative once, alphabetically by title, with a total", () => {
    const view = interestView(d);
    const focus = view.chips.slice(0, 4).map((c) => c.id) as FocusId[];
    const groups = mayInterest(view.initiatives, focus, ["wallet", "audit"], view.chips);
    const ids = focusInitiativeIds(groups);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(1);
    const chain = chainOrder(ids.map((id) => { const i = d.initiatives.find((x) => x.id === id)!; return { id, title: i.title, slug: i.slug, totalMinutes: briefingFor(d, id)!.totalMinutes }; }));
    const titles = chain.map((c) => c.title);
    expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b, "en")));
    expect(chainTotalMinutes(chain)).toBe(chain.reduce((n, c) => n + c.totalMinutes, 0));
  });
  it("orders by title, then slug, and does not mutate the input", () => {
    const input = [{ title: "b", slug: "2" }, { title: "A", slug: "9" }, { title: "a", slug: "1" }];
    // "A" and "a" compare equal in the base letters, so the slug decides between them.
    expect(chainOrder(input).map((x) => x.title)).toEqual(["a", "A", "b"]);
    expect(chainOrder([{ title: "B", slug: "x" }, { title: "A", slug: "y" }]).map((x) => x.title)).toEqual(["A", "B"]);
    expect(input.map((x) => x.slug)).toEqual(["2", "9", "1"]);
  });
  it("uses the same selection as May interest (the chain ids are exactly its items)", () => {
    const view = interestView(d);
    const groups = mayInterest(view.initiatives, [view.chips[0]!.id as FocusId], [], view.chips);
    expect(new Set(focusInitiativeIds(groups))).toEqual(new Set(groups.flatMap((g) => g.items.map((i) => i.id))));
  });
});

describe("local read mark", () => {
  it("sets and clears a mark, and the field defaults to empty for older workspaces", () => {
    const t = new Date("2026-11-27T10:00:00Z");
    const on = setBriefingReadMark({}, "i1:why", true, t);
    expect(on).toEqual({ "i1:why": { readAt: t.toISOString() } });
    expect(setBriefingReadMark(on, "i1:why", false)).toEqual({});
    expect(EMPTY_WORKSPACE.briefingRead).toEqual({});
    expect(WorkspaceSchema.parse({ version: 1 }).briefingRead).toEqual({});
  });
  it("is part of the workspace export and survives import", () => {
    const w = WorkspaceSchema.parse({ version: 1, briefingRead: { "i1:why": { readAt: "2026-11-27T10:00:00.000Z" } } });
    const out = exportWorkspace(w);
    expect(out.workspace.briefingRead).toEqual(w.briefingRead);
    const r = parseImport(JSON.stringify(out));
    expect(r.ok && r.workspace.briefingRead).toEqual(w.briefingRead);
  });
});
