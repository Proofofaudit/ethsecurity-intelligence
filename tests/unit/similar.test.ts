/**
 * Similar initiatives (Item 10, similar@1): deterministic signals, the weak-signal rule, the
 * same-organization rule, verbatim quotes from both proposals, neutral order and labels.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { loadPublishedDataset } from "@/lib/db/file-store";
import { isCoiOrganization } from "@/lib/disclosure";
import type { Dataset, Initiative, Organization, Pledge } from "@/lib/domain/schemas";
import { filterInitiatives, FilterSchema, findInitiative, similarFor, similarPairsOf } from "@/lib/intelligence/service";
import { HYPOTHESIS_NOTICE, isVisible, keywordPhrases, SIMILAR_LABELS, similarPairs, technologiesIn, type SimilarInput, type SimilarPair } from "@/lib/intelligence/similar";
import { parseParams, toFilter } from "@/components/research/params";
import { sentences, stripMarkdown } from "@/lib/util/text";

let d: Dataset;
let base: Initiative;
beforeAll(async () => {
  d = await loadPublishedDataset();
  base = d.initiatives.find((i) => i.type === "grant")!;
});

const cat = (slug: string) => ({ slug, label: slug.toUpperCase() });
function ini(id: string, o: { title?: string; why?: string; scope?: string; categories?: string[]; org?: string | null; type?: "grant" | "rfp" }): Initiative {
  const sections = [
    { key: "why", heading: "Why it matters", markdown: o.why ?? "It is all of the above." },
    ...(o.type === "rfp" ? [] : [{ key: "team", heading: "Team", markdown: "Echidna Foundry Safe hardware wallet clear signing. We built tools." }]),
    { key: "in_scope", heading: "In scope", markdown: o.scope ?? "It is not any of these." },
    { key: "out_scope", heading: "Out of scope", markdown: "Echidna and Safe integration are out of scope." },
  ];
  return {
    ...base,
    id,
    slug: `slug-${id}`,
    title: o.title ?? `Title ${id}`,
    shortTitle: o.title ?? id,
    type: o.type ?? "grant",
    url: `https://initiatives.thedao.fund/initiative/slug-${id}`,
    categories: (o.categories ?? []).map(cat),
    organizationId: o.org === undefined ? `org_${id}` : o.org,
    recipientTeam: o.type === "rfp" ? null : `Team ${id}`,
    sections,
  };
}
const org = (id: string, name: string, anonymous = false): Organization => ({ ...d.organizations[0]!, id, name, names: [name], anonymous });
const pledge = (initiativeId: string, backerId: string, company: string): Pledge => ({ ...d.pledges[0]!, id: `${initiativeId}-${backerId}`, initiativeId, backerId, company });
const input = (initiatives: Initiative[], extra: Partial<SimilarInput> = {}): SimilarInput => ({ initiatives, pledges: [], organizations: [], groups: null, ...extra });
const pairOf = (pairs: SimilarPair[], a: string, b: string) => pairs.find((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a));
const kinds = (p: SimilarPair | undefined) => p?.signals.map((s) => s.kind) ?? [];

function shuffle<T>(xs: readonly T[], seed: number): T[] {
  const out = [...xs];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

describe("signal detection", () => {
  it("detects shared categories, affiliation groups, phrases, technologies, standards and backers", () => {
    const a = ini("a", { categories: ["wallets"], why: "Hardware wallets show blind signing prompts.", scope: "We add Echidna campaigns and ERC-7730 descriptors." });
    const b = ini("b", { categories: ["wallets"], why: "Blind signing on hardware wallets loses funds.", scope: "Echidna support with EIP-7730 files." });
    const pairs = similarPairs(input([a, b], { groups: { a: ["Group X"], b: ["Group X"] }, organizations: [org("org_backer", "Backer Co")], pledges: [pledge("a", "org_backer", "Backer Co"), pledge("b", "org_backer", "Backer Co")] }));
    const p = pairOf(pairs, "a", "b")!;
    expect(kinds(p)).toEqual(["category", "affiliation_group", "keywords", "technology", "backer"]);
    const by = Object.fromEntries(p.signals.map((s) => [s.kind, s]));
    expect(by.category!.terms).toEqual(["WALLETS"]);
    expect(by.affiliation_group!.terms).toEqual(["Group X"]);
    expect(by.keywords!.terms).toEqual(["blind signing", "hardware wallets"]);
    expect(by.keywords!.strength).toBe("strong");
    expect(by.technology!.terms).toEqual(["EIP-7730 / ERC-7730", "Echidna"]);
    expect(by.backer!.terms).toEqual(["Backer Co"]);
    expect(p.label).toBe("Possible overlap");
  });

  it("reads only the why and in_scope sections (team and out_scope text never counts)", () => {
    const a = ini("a", { categories: ["x"] });
    const b = ini("b", { categories: ["x"] });
    expect(similarPairs(input([a, b]))).toEqual([]);
  });

  it("matches technology names case-sensitively with word boundaries", () => {
    expect(technologiesIn("Keep user funds safe at all times.")).toEqual([]);
    expect(technologiesIn("Safe defaults keep users out of trouble.")).toEqual([]);
    expect(technologiesIn("Protocols that adopted Safe Harbor agreements.")).toEqual([]);
    expect(technologiesIn("Deployed on ZKsync Era and Safety Module.")).toEqual([]);
    expect(technologiesIn("A Safe is a contract on Ethereum.")).toEqual(["Safe"]);
    expect(technologiesIn("Safe owners sign through Safe{Wallet}.")).toEqual(["Safe"]);
    expect(technologiesIn("Echidna and Medusa entry points, plus ZK proofs.")).toEqual(["Echidna", "Medusa", "ZK"]);
  });

  it("builds phrases without crossing punctuation, stopwords, boilerplate or generic-only pairs", () => {
    expect(keywordPhrases("Hardware wallets, blind signing.")).toEqual(["hardware wallets", "blind signing"]);
    expect(keywordPhrases("The hard requirements below follow.")).toEqual([]);
    expect(keywordPhrases("Ethereum security for smart contracts.")).toEqual([]);
    expect(keywordPhrases("Clear signing for hardware wallets.")).toEqual(["hardware wallets"]);
  });

  it("does not count anonymous backers", () => {
    const a = ini("a", { why: "Echidna campaigns matter." });
    const b = ini("b", { why: "Echidna campaigns matter too." });
    const orgs = [org("org_anon-hero-1", "Anonymous", true)];
    const pairs = similarPairs(input([a, b], { organizations: orgs, pledges: [pledge("a", "org_anon-hero-1", "Anonymous"), pledge("b", "org_anon-hero-1", "Anonymous")] }));
    expect(kinds(pairOf(pairs, "a", "b"))).not.toContain("backer");
  });
});

describe("visibility and labels", () => {
  it("hides a pair that matches on only one weak signal", () => {
    const a = ini("a", { why: "Threat intelligence feeds are slow." });
    const b = ini("b", { why: "We publish threat intelligence daily." });
    const pairs = similarPairs(input([a, b]));
    expect(pairs).toEqual([]);
    expect(isVisible([{ kind: "keywords", strength: "weak", label: "x", terms: ["x y"], quotes: [{} as never, {} as never] }])).toBe(false);
    // One shared category alone is hidden as well.
    expect(similarPairs(input([ini("c", { categories: ["k"] }), ini("e", { categories: ["k"] })]))).toEqual([]);
  });

  it("shows two weak signals, and labels them by category", () => {
    const a = ini("a", { categories: ["k"], why: "Threat intelligence feeds are slow." });
    const b = ini("b", { categories: ["k"], why: "We publish threat intelligence daily." });
    const p = pairOf(similarPairs(input([a, b])), "a", "b")!;
    expect(p.signals.map((s) => s.strength)).toEqual(["weak", "weak"]);
    expect(p.label).toBe("Possible overlap");
  });

  it("labels a pair without a shared category a possible complement", () => {
    const a = ini("a", { categories: ["k"], why: "We maintain Echidna." });
    const b = ini("b", { categories: ["m"], why: "Properties run under Echidna." });
    expect(pairOf(similarPairs(input([a, b])), "a", "b")!.label).toBe("Possible complement");
  });

  it("labels initiatives of the same organization 'Same organization', not overlap", () => {
    const a = ini("a", { categories: ["k"], org: "org_same", why: "We maintain Echidna." });
    const b = ini("b", { categories: ["k"], org: "org_same", why: "Properties run under Echidna." });
    const c = ini("c", { categories: ["k"], org: null, type: "rfp", why: "This RFP funds Echidna properties." });
    const pairs = similarPairs(input([a, b, c]));
    expect(pairOf(pairs, "a", "b")!.label).toBe("Same organization");
    // An RFP has no recipient organization, so it is never "Same organization", and it is analysed with the same rules.
    expect(pairOf(pairs, "a", "c")!.label).toBe("Possible overlap");
    expect(pairOf(pairs, "b", "c")!.label).toBe("Possible overlap");
  });
});

describe("reproducibility and order", () => {
  it("gives byte-identical output for repeated runs and shuffled input", () => {
    const inp = { initiatives: d.initiatives, pledges: d.pledges, organizations: d.organizations, groups: d.vote.groupsAvailable ? d.vote.initiativeGroups : null };
    const first = JSON.stringify(similarPairs(inp));
    expect(JSON.stringify(similarPairs(inp))).toBe(first);
    for (const seed of [1, 7, 42]) {
      expect(JSON.stringify(similarPairs({ ...inp, initiatives: shuffle(d.initiatives, seed), pledges: shuffle(d.pledges, seed + 1), organizations: shuffle(d.organizations, seed + 2) }))).toBe(first);
    }
  });

  it("orders each dossier list alphabetically by the other initiative's title", () => {
    for (const i of d.initiatives) {
      const titles = similarFor(d, i.id)!.map((x) => x.other.title);
      expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b, "en")));
    }
  });
});

describe("published cohort", () => {
  it("shows evidence on every pair: signals, a quote from each proposal with a link, the notice and an allowed label", () => {
    const pairs = similarPairsOf(d);
    expect(pairs.length).toBeGreaterThan(0);
    for (const p of pairs) {
      expect(SIMILAR_LABELS).toContain(p.label);
      expect(p.notice).toBe(HYPOTHESIS_NOTICE);
      expect(isVisible(p.signals)).toBe(true);
      const quoted = p.signals.filter((s) => s.quotes);
      expect(quoted.length).toBeGreaterThan(0);
      expect(p.signals.length + quoted.length * 2).toBeGreaterThanOrEqual(2);
      for (const s of quoted) {
        expect(s.quotes!.map((q) => q.initiativeId)).toEqual([p.a, p.b]);
        for (const q of s.quotes!) {
          const owner = findInitiative(d, q.initiativeId)!;
          const section = owner.sections.find((x) => x.key === q.section)!;
          expect(["why", "in_scope"]).toContain(q.section);
          expect(q.url).toBe(`${owner.url}#${q.section}`);
          // Verbatim: the quote is one sentence of the cited official section.
          expect(sentences(section.markdown)).toContain(q.text);
          expect(stripMarkdown(section.markdown)).toContain(q.text);
          expect(q.terms.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("labels every same-organization pair 'Same organization' and no other pair", () => {
    for (const p of similarPairsOf(d)) {
      const a = findInitiative(d, p.a)!;
      const b = findInitiative(d, p.b)!;
      expect(p.label === "Same organization").toBe(!!a.organizationId && a.organizationId === b.organizationId);
    }
  });

  it("never says duplicate or waste", () => {
    const text = JSON.stringify(similarPairsOf(d).map((p) => ({ label: p.label, notice: p.notice, signals: p.signals.map((s) => s.label) })));
    expect(text).not.toMatch(/duplicat|waste/i);
  });

  it("analyses the conflict-of-interest initiative with the same function and rules", () => {
    const coi = d.initiatives.find((i) => isCoiOrganization(i.organizationId))!;
    expect(coi).toBeDefined();
    const inp = { initiatives: d.initiatives, pledges: d.pledges, organizations: d.organizations, groups: d.vote.groupsAvailable ? d.vote.initiativeGroups : null };
    const strip = (pairs: SimilarPair[], id: string) => pairs.filter((p) => p.a === id || p.b === id).map((p) => ({ other: p.a === id ? p.b : p.a, label: p.label, signals: p.signals.map((s) => ({ ...s, quotes: s.quotes?.map((q) => ({ ...q, initiativeId: q.initiativeId === id ? "self" : q.initiativeId, url: q.url.replace(/^.*#/, "#") })) })) }));
    // The same initiative under a neutral id, slug and organization gets the same pairs and signals.
    const renamed: Initiative = { ...coi, id: "neutral", slug: "neutral", organizationId: "org_neutral", url: "https://example.org/neutral" };
    const sortQuotes = (xs: ReturnType<typeof strip>) => JSON.stringify(xs.map((x) => ({ ...x, signals: x.signals.map((s) => ({ ...s, quotes: s.quotes?.slice().sort((m, n) => (m.initiativeId < n.initiativeId ? -1 : 1)) })) })).sort((m, n) => (m.other < n.other ? -1 : 1)));
    const before = sortQuotes(strip(similarPairs(inp), coi.id));
    const after = sortQuotes(strip(similarPairs({ ...inp, initiatives: d.initiatives.map((i) => (i.id === coi.id ? renamed : i)), pledges: d.pledges.map((p) => (p.initiativeId === coi.id ? { ...p, initiativeId: "neutral" } : p)), groups: inp.groups ? Object.fromEntries(Object.entries(inp.groups).map(([k, v]) => [k === coi.id ? "neutral" : k, v])) : null }), "neutral"));
    expect(before).not.toBe("[]");
    expect(after).toBe(before);
  });

  it("the engine module has no special case for any initiative or organization", async () => {
    const src = await fs.readFile(path.resolve(import.meta.dirname, "../../lib/intelligence/similar.ts"), "utf8");
    expect(src).not.toMatch(/isCoiOrganization|COI_ORGANIZATION_ID|org_[a-z]/);
  });
});

describe("Research filter", () => {
  it("parses ?similar= and filters to initiatives with a pair of that label", () => {
    expect(parseParams({ similar: "overlap" }).similar).toBe("overlap");
    expect(parseParams({ similar: "bogus" }).similar).toBe("");
    const pairs = similarPairsOf(d);
    for (const [v, label] of [
      ["any", null],
      ["overlap", "Possible overlap"],
      ["complement", "Possible complement"],
    ] as const) {
      const f = FilterSchema.parse(toFilter(parseParams({ similar: v })));
      const got = filterInitiatives(d, f).items.map((r) => r.id).sort();
      const want = [...new Set(pairs.filter((p) => !label || p.label === label).flatMap((p) => [p.a, p.b]))].sort();
      expect(got).toEqual(want);
    }
  });
});
