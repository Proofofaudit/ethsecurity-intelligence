import { promises as fs } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { Dataset } from "@/lib/domain/schemas";
import { envelope } from "@/lib/intelligence/service";
import {
  ALLOWED_FRAMING,
  BANNED_PHRASES,
  filterAiOutput,
  findBannedPhrases,
  isNeutral,
  NEUTRAL_LANGUAGE_VERSION,
  officialQuote,
  SOURCE_LABELS,
  stripOfficialQuotations,
} from "@/lib/neutralLanguage";
import { buildNeutralBrief, modeConfig } from "@/lib/skills";
import { buildSkillContext } from "@/lib/skills/context";
import { neutralEnvelope, serverInstructions } from "@/mcp/server";

let d: Dataset;
beforeAll(async () => {
  d = await (await import("@/lib/db/file-store")).loadPublishedDataset();
});

const phrases = (t: string) => findBannedPhrases(t).map((m) => m.phrase);

describe("lists", () => {
  it("match NEUTRAL_LANGUAGE.md exactly, with the same version", async () => {
    const md = await fs.readFile(path.resolve(import.meta.dirname, "../../NEUTRAL_LANGUAGE.md"), "utf8");
    expect(md).toContain(`Version: ${NEUTRAL_LANGUAGE_VERSION}`);
    expect(md).toContain(BANNED_PHRASES.map((p) => `"${p}"`).join(", "));
    for (const f of ALLOWED_FRAMING) expect(md).toContain(`- "${f}"`);
    for (const l of Object.values(SOURCE_LABELS)) expect(md).toContain(`**${l}**`);
    expect(BANNED_PHRASES).toHaveLength(19);
    expect(SOURCE_LABELS).toEqual({ official: "Official data", applicant: "Applicant statement", independent: "Independent evidence", ai: "AI interpretation" });
  });

  it("allowed framing passes the filter", () => {
    for (const f of ALLOWED_FRAMING) expect(isNeutral(f)).toBe(true);
    expect(isNeutral("This may interest you because it matches your selected focus: Wallet security. Evidence found: 2 links. Not found: audit report.")).toBe(true);
  });
});

describe("findBannedPhrases", () => {
  it("is case-insensitive and handles hyphen, space and no-space variants", () => {
    expect(phrases("This is MUST-FUND work")).toContain("must fund");
    expect(phrases("Must fund")).toEqual(["must fund"]);
    expect(phrases("mustfund")).toEqual(["must fund"]);
    expect(phrases("must\u2011fund")).toEqual(["must fund"]);
    expect(phrases("a Safe-Bet")).toEqual(["safe bet"]);
    expect(phrases("TOP PICKS")).toEqual(["top pick"]);
  });

  it("catches inflections of listed words", () => {
    expect(phrases("recommended")).toEqual(["recommended"]);
    expect(phrases("No recommendation")).toEqual(["recommend"]);
    expect(phrases("Skipped")).toEqual(["skip"]);
    expect(phrases("Skip to content")).toEqual(["skip"]);
    expect(phrases("avoiding risk")).toEqual(["avoid"]);
    expect(phrases("the winners")).toEqual(["winner"]);
    expect(phrases("it deserve support")).toEqual(["deserves"]);
    expect(phrases("I voted for it")).toEqual(["vote for"]);
    expect(phrases("should be funded")).toEqual(["should fund"]);
    expect(phrases("it shouldn't")).toEqual(["should not"]);
    expect(phrases("Best-in-class")).toEqual(["best"]);
    expect(phrases("Underrated")).toEqual(["underrated"]);
  });

  it("ignores longer words that only start with a banned word", () => {
    for (const w of ["bestow", "skipper", "avoider", "voter for", "winnerless", "Upskip"]) expect(phrases(w), w).toEqual([]);
  });

  it("reports the position of each match", () => {
    const t = "Evidence found. You should fund this.";
    const m = findBannedPhrases(t);
    expect(m.map((x) => [x.phrase, x.index])).toEqual([
      ["you should", 16],
      ["should fund", 20],
    ]);
    expect(t.slice(m[0]!.index, m[0]!.index + m[0]!.match.length)).toBe("You should");
  });
});

describe("official quotations", () => {
  it("are exempt only inside the marker", () => {
    const q = officialQuote("S-tier: must-fund initiatives.", "https://initiatives.thedao.fund");
    expect(isNeutral(`TheDAO defines S-tier as follows: ${q}`)).toBe(true);
    expect(phrases(`${q} We think this is a must-fund.`)).toEqual(["must fund"]);
    expect(phrases("<official-quote source=x>must fund</official-quote> must fund <official-quote>best</official-quote>")).toEqual(["must fund"]);
    // An unclosed marker exempts nothing.
    expect(phrases('<official-quote source="x">must fund')).toEqual(["must fund"]);
  });

  it("keep offsets when blanked", () => {
    const t = `${officialQuote("best", "x")} best`;
    expect(stripOfficialQuotations(t)).toHaveLength(t.length);
    expect(findBannedPhrases(t)[0]!.index).toBe(t.length - 4);
  });
});

describe("filterAiOutput", () => {
  it("blocks a test AI response containing 'you should fund' and returns the raw evidence", () => {
    const r = filterAiOutput("Based on the evidence, you should fund this initiative.", "Raw evidence: https://example.org/e/1");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.fallback).toBe("Raw evidence: https://example.org/e/1");
    expect(r.matches.map((m) => m.phrase)).toEqual(["you should", "should fund"]);
    expect(JSON.stringify(r)).not.toContain("this initiative");
  });

  it("passes neutral text through unchanged", () => {
    expect(filterAiOutput("Question to consider: who maintains the repository?", "x")).toEqual({ ok: true, text: "Question to consider: who maintains the repository?" });
  });
});

describe("AI Lab brief filter", () => {
  it("discards a brief with a banned phrase and shows raw evidence with links", () => {
    const ctx = buildSkillContext(d, "http://localhost:3000");
    const clean = buildNeutralBrief(modeConfig("grant-evaluator"), ctx);
    expect(clean.ok).toBe(true);
    const bad = buildNeutralBrief({ ...modeConfig("grant-evaluator"), focusQuestions: ["Explain why you should fund this one"] }, ctx);
    expect(bad.ok).toBe(false);
    expect(bad.matches.map((m) => m.phrase)).toContain("you should");
    for (const t of [bad.prompt, bad.skill.markdown, bad.json]) expect(t).not.toContain("Explain why");
    expect(bad.prompt).toContain(`${ctx.siteUrl}/initiatives/`);
    expect(bad.prompt).toContain(`${ctx.siteUrl}/api/v1/initiatives/`);
  });
});

describe("MCP text", () => {
  it("instructions are neutral and name the four source labels", () => {
    const t = serverInstructions(d);
    expect(isNeutral(t)).toBe(true);
    for (const l of Object.values(SOURCE_LABELS)) expect(t).toContain(l);
  });

  it("replaces generated notes and limitations that fail the filter, keeping data", () => {
    const env = envelope(d, { note: "This is the best option.", items: [{ quote: "best wallet" }] }, { limitations: ["Evidence found in 3 sources.", "Avoid this one."] });
    const out = neutralEnvelope(env);
    const data = out.data as { note: string; items: { quote: string }[] };
    expect(isNeutral(data.note)).toBe(true);
    expect(data.items[0]!.quote).toBe("best wallet");
    expect(out.meta.limitations[0]).toBe("Evidence found in 3 sources.");
    expect(out.meta.limitations.every(isNeutral)).toBe(true);
  });
});
