import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Dataset } from "@/lib/domain/schemas";
import { isCoiOrganization } from "@/lib/disclosure";
import { isNeutral } from "@/lib/neutralLanguage";
import { MODES } from "@/lib/skills/modes";
import { findKeyword, FOCUS_MODE_TABLE, hasEvidenceLink, KEYWORD_ENDINGS, matchKeyword, mayInterest, type FocusId, type InterestGroup, type InterestInitiative } from "@/lib/vote/interest";
import { interestView } from "@/lib/vote/view-data";

const d = JSON.parse(readFileSync(path.join(process.cwd(), "data", "published", "dataset.json"), "utf8")) as Dataset;
const view = interestView(d);
const allFocus = view.chips.map((c) => c.id);
const all = mayInterest(view.initiatives, allFocus, ["fuzzing", "clear signing"], view.chips);
const items = (gs: InterestGroup[]) => gs.flatMap((g) => g.items);

describe("focus chips and the mode table", () => {
  it("has the 10 official categories and every AI Lab research mode", () => {
    const cats = view.chips.filter((c) => c.kind === "category");
    expect(cats).toHaveLength(10);
    expect(view.chips.filter((c) => c.kind === "mode").map((c) => c.id)).toEqual(MODES.map((m) => `mode:${m.id}`));
  });

  it("maps every mode to official category slugs and at least one keyword", () => {
    const slugs = new Set(d.initiatives.flatMap((i) => i.categories.map((c) => c.slug)));
    expect(FOCUS_MODE_TABLE.map((m) => m.mode)).toEqual(MODES.map((m) => m.id));
    for (const m of FOCUS_MODE_TABLE) {
      for (const c of m.categories) expect(slugs.has(c), `${m.mode}: ${c}`).toBe(true);
      expect(m.keywords.length).toBeGreaterThan(0);
    }
  });
});

describe("may interest you", () => {
  it("every item has a reason and an evidence link", () => {
    expect(items(all).length).toBeGreaterThan(0);
    for (const i of items(all)) {
      expect(i.reasons.length).toBeGreaterThan(0);
      for (const r of i.reasons) expect(r.matched.length).toBeGreaterThan(0);
      expect(hasEvidenceLink(i.links)).toBe(true);
    }
  });

  it("reasons use the allowed framing and pass the neutral-language rules", () => {
    for (const i of items(all))
      for (const r of i.reasons) {
        expect(r.text.startsWith("Matches your selected focus: ") || r.text.startsWith("This may interest you because ")).toBe(true);
        expect(isNeutral(r.text), r.text).toBe(true);
      }
    for (const g of all) expect(isNeutral(g.label), g.label).toBe(true);
  });

  it("is alphabetical inside each group and groups follow the chip order", () => {
    for (const g of all) expect(g.items.map((i) => i.label)).toEqual([...g.items.map((i) => i.label)].sort((a, b) => a.localeCompare(b)));
    expect(all.slice(0, allFocus.length).map((g) => g.key)).toEqual(allFocus);
    expect(all.slice(allFocus.length).map((g) => g.label)).toEqual(["Your keyword: fuzzing", "Your keyword: clear signing"]);
  });

  it("produces no score, rank or percentage fields", () => {
    const keys = new Set<string>();
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object")
        for (const [k, x] of Object.entries(v)) {
          keys.add(k);
          walk(x);
        }
    };
    walk(all);
    for (const k of keys) expect(/score|rank|weight|percent|pct|match_?rate|relevance|priority/i.test(k), k).toBe(false);
    for (const i of items(all)) for (const v of Object.values(i)) expect(typeof v === "number").toBe(false);
  });

  it("a category chip returns exactly the initiatives with that official category", () => {
    const g = mayInterest(view.initiatives, ["cat:wallets-signing"], [], view.chips)[0]!;
    const expected = d.initiatives.filter((i) => i.categories.some((c) => c.slug === "wallets-signing")).map((i) => i.id).sort();
    expect(g.items.map((i) => i.id).sort()).toEqual(expected);
    for (const i of g.items) expect(i.reasons[0]!.text).toBe("Matches your selected focus: Wallets & Signing");
  });

  it("leaves out items without an evidence link", () => {
    const noLinks: InterestInitiative[] = view.initiatives.map((i) => ({ ...i, officialUrl: "", evidence: null }));
    expect(items(mayInterest(noLinks, allFocus as FocusId[], [], view.chips))).toEqual([]);
  });

  it("keyword matching is whole-word and quotes the official text", () => {
    expect(findKeyword("Fuzzing campaigns for clients", "fuzzing")).toContain("Fuzzing campaigns");
    expect(findKeyword("Refuzzing", "fuzzing")).toBeNull();
    expect(findKeyword("clear-signing for wallets", "clear signing")).toContain("clear-signing");
    expect(findKeyword("anything", "a")).toBeNull();
  });

  it("accepts common endings on the last word of a keyword", () => {
    expect(findKeyword("Audits for wallets", "wallet")).toContain("wallets");
    expect(findKeyword("Audits for wallets", "audit")).toContain("Audits");
    expect(matchKeyword("Tools maintained by the team", "maintain")?.found).toBe("maintained");
    expect(matchKeyword("Known attackers and their exploits", "attacker")?.found).toBe("attackers");
    expect(matchKeyword("Open bug bounties", "bounty")?.found).toBe("bounties");
    expect(matchKeyword("threat models for bridges", "threat model")?.found).toBe("threat models");
    expect(KEYWORD_ENDINGS).toEqual(["s", "es", "ed", "ing", "er", "ers"]);
    // Still whole words: no match inside a longer word or with an unlisted ending.
    expect(findKeyword("Refuzzing", "fuzzing")).toBeNull();
    expect(findKeyword("walletless", "wallet")).toBeNull();
    expect(findKeyword("nodejs", "node")).toBeNull();
  });

  it("drops a final 'e' before -ed, -ing, -er and -ers (review v2)", () => {
    expect(matchKeyword("Securing Ethereum with formal verification", "secure")?.found).toBe("Securing");
    expect(matchKeyword("A decentralized archive", "decentralize")?.found).toBe("decentralized");
    expect(matchKeyword("Funds secured by the DAO", "secure")?.found).toBe("secured");
    expect(matchKeyword("It secures funds", "secure")?.found).toBe("secures");
    expect(matchKeyword("A secure wallet", "secure")?.found).toBe("secure");
    // The stem alone or an unlisted ending is not a match.
    expect(findKeyword("secur", "secure")).toBeNull();
    expect(findKeyword("security", "secure")).toBeNull();
    // Two-letter words keep the plain endings, so "be" never finds "bed".
    expect(findKeyword("a bed", "be")).toBeNull();
    // The published cohort: typed keywords find the initiatives the e-final miss left out.
    for (const [kw, prefix] of [
      ["secure", "securing-ethereum-with-formal-verification"],
      ["decentralize", "decentralized-archive-for-ethereum-blob-data"],
    ] as const) {
      const g = mayInterest(view.initiatives, [], [kw], view.chips)[0]!;
      expect(g.items.some((i) => i.slug.startsWith(prefix)), kw).toBe(true);
    }
  });

  it("finds the inflected forms in the published cohort that whole-word matching missed (review v1)", () => {
    const missed: [string, string][] = [
      ["security-researcher", "economic-property-packs-for-amms-and-lending-"],
      ["grant-evaluator", "decentralized-archive-for-ethereum-blob-data"],
      ["grant-evaluator", "leakdetectai-detecting-and-eliminating-side-c"],
      ["adversarial-reviewer", "dappfence-verifiable-frontend-security"],
      ["adversarial-reviewer", "an-open-bug-bounty-program-for-all-of-ethereu"],
      ["adversarial-reviewer", "rfp-stop-patches-from-becoming-exploits-coord"],
    ];
    for (const [mode, prefix] of missed) {
      const g = mayInterest(view.initiatives, [`mode:${mode}` as FocusId], [], view.chips)[0]!;
      expect(g.items.some((i) => i.slug.startsWith(prefix)), `${mode}: ${prefix}`).toBe(true);
    }
    // A typed keyword has no category fallback, so the ending matters there too.
    const wallets = d.initiatives.filter((i) => /\bwallets\b/i.test(`${i.title} ${i.summary}`) && !/\bwallet\b/i.test(`${i.title} ${i.summary} ${i.standards.join(", ")}`));
    expect(wallets.length).toBeGreaterThan(0);
    const kw = mayInterest(view.initiatives, [], ["wallet"], view.chips)[0]!;
    for (const i of wallets) expect(kw.items.some((x) => x.id === i.id), i.slug).toBe(true);
  });

  it("quotes the official form when it differs from the keyword", () => {
    const g = mayInterest(view.initiatives, [], ["attack"], view.chips)[0]!;
    const plural = g.items.find((i) => i.reasons[0]!.text.includes("(a form of “attack”)"));
    expect(plural).toBeTruthy();
    expect(plural!.reasons[0]!.text).toMatch(/mentions “attack\w+” \(a form of “attack”\)\.$/i);
    for (const i of g.items) expect(isNeutral(i.reasons[0]!.text)).toBe(true);
  });

  it("treats the initiative with the site owner's conflict of interest exactly like every other", () => {
    const coi = d.initiatives.filter((i) => isCoiOrganization(i.organizationId));
    expect(coi).toHaveLength(1);
    const target = coi[0]!;
    for (const c of target.categories) {
      const g = mayInterest(view.initiatives, [`cat:${c.slug}` as FocusId], [], view.chips)[0]!;
      const expected = d.initiatives.filter((i) => i.categories.some((x) => x.slug === c.slug)).map((i) => i.id).sort();
      expect(g.items.map((i) => i.id).sort()).toEqual(expected);
      const mine = g.items.find((i) => i.id === target.id)!;
      const other = g.items.find((i) => i.id !== target.id)!;
      expect(Object.keys(mine)).toEqual(Object.keys(other));
      expect(mine.reasons.map((r) => r.text)).toEqual(other.reasons.map((r) => r.text));
      expect(mine.links.map((l) => l.kind).filter((k) => k !== "evidence")).toEqual(other.links.map((l) => l.kind).filter((k) => k !== "evidence"));
    }
  });
});
