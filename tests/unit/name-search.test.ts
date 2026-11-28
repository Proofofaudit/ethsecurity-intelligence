/**
 * Badge-holder name search: CSV reading (public fields only), typo-tolerant matching, grouping and
 * the privacy guarantees. Fixtures are fictional (Alex Example, @example_alex).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import dataset from "@/data/published/dataset.json";
import type { Dataset } from "@/lib/domain/schemas";
import { canShowDirectly, editDistance, matchHolders, normalizeHandle, parseBadgeHolderCsv, PUBLIC_COLUMNS, type BadgeHolder } from "@/lib/search/badge-holders";
import { badgesFor, buildCardData, type CardData } from "@/lib/search/card-data";
import { buildSearchIndex } from "@/lib/search/build";
import { connectionsFor, GROUP_LABEL, GROUP_ORDER, sameOrganisation, type IndexInitiative, type SearchIndex } from "@/lib/search/connections";
import { loadBadgeHolders } from "@/lib/search/server";
import type { TeamResearchFile } from "@/lib/team/types";

const ROOT = path.resolve(import.meta.dirname, "../..");
const FIXTURE = path.join(ROOT, "tests", "fixtures", "badge-holders.csv");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const CSV = [
  "name,email,organisation,x_handle,linkedin,website,github,aliases",
  'Alex Example,alex@example.invalid,"Example Labs, Inc.",@Example_Alex,,https://www.example.invalid/team,ExampleOrg,Alexander Example;A. Example',
  "Alex Exemplar,ex@example.invalid,Other Co,example_alexa,,,,",
  "Sam Sample,sam@example.invalid,,@example_sam,,,,Samantha Sample",
  ",nobody@example.invalid,Ghost Org,,,,,",
].join("\n");

const holders = parseBadgeHolderCsv(CSV);

describe("CSV reader", () => {
  it("reads public columns only and drops the email column", () => {
    expect(holders).toHaveLength(3);
    expect(Object.keys(holders[0]!).sort()).toEqual(["aliases", "checkedOn", "github", "membershipSource", "name", "organisation", "website", "xHandle"]);
    expect(JSON.stringify(holders)).not.toMatch(/@example\.invalid|email/i);
    expect(PUBLIC_COLUMNS).not.toContain("email");
  });

  it("handles quoted commas, aliases and handles with or without @", () => {
    expect(holders[0]).toMatchObject({ name: "Alex Example", organisation: "Example Labs, Inc.", xHandle: "example_alex", github: "ExampleOrg", aliases: ["Alexander Example", "A. Example"] });
    expect(holders[1]!.xHandle).toBe("example_alexa");
  });

  it("returns nothing for a file without a name column or without rows", () => {
    expect(parseBadgeHolderCsv("organisation\nExample Co")).toEqual([]);
    expect(parseBadgeHolderCsv("")).toEqual([]);
    expect(parseBadgeHolderCsv("name,email\n")).toEqual([]);
  });

  it("ships the fixture with an email column that never reaches the parsed list", () => {
    const raw = readFileSync(FIXTURE, "utf8");
    expect(raw).toContain("email");
    const list = parseBadgeHolderCsv(raw);
    expect(list.map((h) => h.name)).toEqual(["Alex Example", "Alex Exemplar", "Sam Sample"]);
    expect(JSON.stringify(list)).not.toContain("example.invalid,");
    expect(JSON.stringify(list)).not.toMatch(/sam@|alex@|exemplar@/);
  });

  it("is absent by default, so the page shows the honest empty state", () => {
    expect(loadBadgeHolders(path.join(ROOT, "tests", "fixtures", "does-not-exist.csv"))).toBeNull();
    expect(loadBadgeHolders(FIXTURE)).toHaveLength(3);
  });
});

describe("handles", () => {
  it.each([
    ["@Example_Alex", "example_alex"],
    ["example_alex", "example_alex"],
    ["https://x.com/Example_Alex?s=20", "example_alex"],
    ["twitter.com/example_alex/", "example_alex"],
    ["  @@example_alex ", "example_alex"],
  ])("normalizes %s", (raw, out) => expect(normalizeHandle(raw)).toBe(out));
});

describe("matcher", () => {
  const names = (q: string) => matchHolders(holders, q).map((m) => m.holder.name);

  it("matches case-insensitively on name, alias and X handle, with or without @", () => {
    expect(names("alex example")[0]).toBe("Alex Example");
    expect(matchHolders(holders, "alex example")[0]!.rank).toBe(0);
    expect(names("ALEXANDER EXAMPLE")[0]).toBe("Alex Example");
    expect(names("a. example")).toContain("Alex Example");
    expect(names("@example_alex")).toEqual(["Alex Example"]);
    expect(names("EXAMPLE_ALEX")[0]).toBe("Alex Example");
    expect(names("samantha sample")).toEqual(["Sam Sample"]);
  });

  it("tolerates typos in proportion to length, including swapped letters", () => {
    expect(names("alxe example")).toContain("Alex Example");
    expect(names("alex exmaple")).toContain("Alex Example");
    expect(names("alex examplle")).toContain("Alex Example");
    expect(names("@exampel_alex")).toContain("Alex Example");
    expect(names("sam sampel")).toEqual(["Sam Sample"]);
    expect(editDistance("exmaple", "example")).toBe(1);
  });

  it("does not match unrelated text or very short queries", () => {
    expect(names("zzzz")).toEqual([]);
    expect(names("a")).toEqual([]);
    expect(names("")).toEqual([]);
    expect(names("bob")).toEqual([]);
  });

  it("returns several matches for a shared first name, alphabetical inside the same closeness, and never auto-selects", () => {
    const m = matchHolders(holders, "alex");
    expect(m.map((x) => x.holder.name)).toEqual(["Alex Example", "Alex Exemplar"]);
    expect(canShowDirectly(m)).toBe(false);
  });

  it("allows a direct result only for one exact match", () => {
    expect(canShowDirectly(matchHolders(holders, "sam sample"))).toBe(true);
    expect(canShowDirectly(matchHolders(holders, "sam sampel"))).toBe(false);
    expect(canShowDirectly(matchHolders(holders, "zzzz"))).toBe(false);
  });
});

// ───────────────────────────── grouping ─────────────────────────────

const card = (id: string, shortTitle: string): CardData => ({
  id,
  slug: id,
  title: shortTitle,
  shortTitle,
  displayTitle: shortTitle,
  organization: null,
  officialUrl: `https://initiatives.example.invalid/${id}`,
  evidence: null,
  delivery: null,
  affiliatedWith: [],
  logo: null,
});
const ini = (id: string, shortTitle: string, over: Partial<IndexInitiative> = {}): IndexInitiative => ({
  card: card(id, shortTitle),
  officialUrl: `https://initiatives.example.invalid/${id}`,
  organizations: [],
  hosts: [],
  category: { slug: "cat-a", label: "Category A" },
  repos: [],
  people: [],
  backers: [],
  linkedXHandles: [],
  ...over,
});
const index: SearchIndex = {
  initiatives: [
    ini("z-org", "Zeta", { organizations: ["Example Labs Inc"] }),
    ini("a-org", "Alpha", { organizations: ["Example Labs"] }),
    ini("r1", "Repo One", { repos: [{ fullName: "exampleorg/tool", url: "https://github.com/exampleorg/tool" }], category: { slug: "cat-b", label: "Category B" } }),
    ini("area-1", "Area Beta", { category: { slug: "cat-b", label: "Category B" } }),
    ini("area-2", "Area Alpha", { category: { slug: "cat-b", label: "Category B" } }),
    ini("p1", "Person", { people: [{ name: "Sam Sample", xHandles: [], githubHandles: [], sourceUrl: "https://example.invalid/team" }], category: { slug: "cat-c", label: "Category C" } }),
    ini("x1", "Linked", { linkedXHandles: ["example_sam"], category: { slug: "cat-c", label: "Category C" } }),
    ini("none", "Unrelated", { category: { slug: "cat-z", label: "Category Z" } }),
  ],
};

describe("grouping", () => {
  const alex = holders[0]!;
  const groups = connectionsFor(alex, index);

  it("orders groups Your organisation, Your repos, Your security area, Public connections", () => {
    expect(GROUP_ORDER.map((k) => GROUP_LABEL[k])).toEqual(["Your organisation", "Your repos", "Your security area", "Public connections"]);
    expect(groups.map((g) => g.label)).toEqual(["Your organisation", "Your repos", "Your security area"]);
  });

  it("sorts cards alphabetically inside each group", () => {
    expect(groups[0]!.cards.map((c) => c.card.displayTitle)).toEqual(["Alpha", "Zeta"]);
    expect(groups[2]!.cards.map((c) => c.card.displayTitle)).toEqual(["Area Alpha", "Area Beta"]);
  });

  it("gives every card one why-line and at least one evidence link, and lists an initiative once", () => {
    const all = groups.flatMap((g) => g.cards);
    for (const c of all) {
      expect(c.why.length).toBeGreaterThan(10);
      expect(c.evidence.length).toBeGreaterThan(0);
      for (const e of c.evidence) expect(e.url).toMatch(/^https:\/\//);
    }
    expect(new Set(all.map((c) => c.card.id)).size).toBe(all.length);
    expect(all.map((c) => c.card.id)).not.toContain("none");
  });

  it("places repo owners, named team members and linked X profiles", () => {
    expect(groups[1]!.cards.map((c) => c.card.id)).toEqual(["r1"]);
    const sam = connectionsFor(holders[2]!, index);
    expect(sam.map((g) => g.key)).toEqual(["public"]);
    expect(sam[0]!.cards.map((c) => c.card.id)).toEqual(["x1", "p1"]);
  });

  it("shows nothing for a holder with no public source", () => {
    expect(connectionsFor(holders[1]!, index)).toEqual([]);
  });

  it("compares organizations by whole words and ignores lone generic words", () => {
    expect(sameOrganisation("Example Labs", "Example Labs Inc")).toBe(true);
    expect(sameOrganisation("Labs", "Example Labs")).toBe(false);
    expect(sameOrganisation("Exam", "Example Labs")).toBe(false);
    expect(sameOrganisation("", "Example")).toBe(false);
  });
});

describe("real dataset index", () => {
  const d = dataset as unknown as Dataset;
  const idx = buildSearchIndex(d, null);

  it("covers every initiative with alphabetical card data and no emails", () => {
    expect(idx.initiatives).toHaveLength(d.initiatives.length);
    const cards = buildCardData(d, null);
    expect(cards.map((c) => c.shortTitle)).toEqual([...cards.map((c) => c.shortTitle)].sort((a, b) => a.localeCompare(b)));
    expect(JSON.stringify(idx)).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    expect(JSON.stringify(idx)).not.toMatch(/"emails?"/i);
  });

  it("finds an initiative through a repository owner and an organization with public sources", () => {
    const gh: BadgeHolder = { name: "Alex Example", organisation: "", xHandle: "", website: "", github: "https://github.com/BlossomLabs", aliases: [], membershipSource: "", checkedOn: "" };
    const repoGroup = connectionsFor(gh, idx).find((g) => g.key === "repos");
    expect(repoGroup?.cards.length).toBeGreaterThan(0);
    for (const c of repoGroup!.cards) expect(c.evidence[0]!.url).toContain("github.com/");
    const org = connectionsFor({ ...gh, github: "", organisation: "Blossom Labs" }, idx);
    expect(org[0]!.key).toBe("organisation");
  });
});

describe("badges from team research", () => {
  const file: TeamResearchFile = {
    generatedAt: "2026-11-27T00:00:00Z",
    initiatives: [
      {
        initiativeId: "a",
        members: [],
        organization: null,
        deliveryTimeline: [
          { grant: "G1", funder: "F", promised: "P", status: "Delivered", sources: [], checkedOn: "2026-11-01" },
          { grant: "G2", funder: "F", promised: "P", status: "No public evidence", sources: [], checkedOn: "2026-11-01" },
        ],
        claimChecks: [{ claim: "C", status: "Contradicted by source", sources: [], checkedOn: "2026-11-01" }],
        questions: [],
      },
      { initiativeId: "b", members: [], organization: null, deliveryTimeline: [], claimChecks: [], questions: [] },
    ],
  };
  it("maps statuses, shows no synthetic badge when no claim check exists and null when not researched", () => {
    expect(badgesFor(file, "a")).toEqual({ evidence: [{ kind: "contradicted", count: 1 }], delivery: [{ kind: "delivered", count: 1 }, { kind: "none", count: 1 }] });
    expect(badgesFor(file, "b")).toEqual({ evidence: [], delivery: [] });
    expect(badgesFor(file, "c")).toEqual({ evidence: null, delivery: null });
    expect(badgesFor(null, "a")).toEqual({ evidence: null, delivery: null });
  });
});

describe("the query never leaves the browser", () => {
  const src = read("components/home/name-search.tsx");
  const logic = read("lib/search/badge-holders.ts") + read("lib/search/connections.ts") + read("lib/search/card-data.ts");

  it("the component and matcher use no network, storage, logging, timers or navigation", () => {
    for (const code of [src, logic]) {
      expect(code).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|localStorage|sessionStorage|indexedDB|document\.cookie/);
      expect(code).not.toMatch(/console\.(log|info|warn|error|debug)/);
      expect(code).not.toMatch(/router\.|useRouter|usePathname|useSearchParams|history\.|location\./);
    }
  });

  it("has no form, so Enter cannot submit the query, and never writes it to a URL", () => {
    expect(src).not.toMatch(/<form\b/);
    expect(src).not.toMatch(/href=\{[^}]*query/);
  });

  it("server code never receives the query: the page passes holders and the index only", () => {
    const page = read("app/page.tsx");
    expect(page).toContain("<NameSearch holders={holders} index={index}");
    expect(page).not.toMatch(/searchParams/);
  });
});
