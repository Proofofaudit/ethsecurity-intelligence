import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Dataset } from "@/lib/domain/schemas";
import { isNeutral } from "@/lib/neutralLanguage";
import { strictKey } from "@/lib/domain/identity";
import {
  AFFILIATED_WITH,
  affiliationFlag,
  affiliationSuggestions,
  affiliationTargets,
  entryTerms,
  GENERIC_WORDS,
  GROUPS_OFF_NOTE,
  isFlagged,
  MARKED_AFFILIATED,
  matchAffiliations,
  matchText,
  MAY_BE_AFFILIATED,
  nameSegments,
  OPTIONAL_WORDS,
  peersOf,
  POSSIBLY_OWN,
  S_TIER_REMINDER,
  SAME_NAME_OPTIONAL_WORDS,
  sharedAffiliations,
  termMatches,
} from "@/lib/vote/affiliation";
import { addAffiliationEntry, EMPTY_WORKSPACE, removeAffiliationEntry, setAffiliationOverride, WorkspaceSchema } from "@/components/workspace/schema";

const d = JSON.parse(readFileSync(path.join(process.cwd(), "data", "published", "dataset.json"), "utf8")) as Dataset;
const targets = affiliationTargets(d);
const sealGroup = Object.entries(d.vote.initiativeGroups)
  .filter(([, g]) => g.includes("SEAL"))
  .map(([id]) => id)
  .sort();

describe("affiliation matching", () => {
  it("the cohort has SEAL initiatives in the manifest", () => {
    expect(d.vote.groupsAvailable).toBe(true);
    expect(sealGroup.length).toBeGreaterThanOrEqual(2);
  });

  it("'Security Alliance (SEAL)' matches every SEAL initiative and nothing else", () => {
    const m = matchAffiliations(["Security Alliance (SEAL)"], targets);
    expect(Object.keys(m).sort()).toEqual(sealGroup);
    for (const id of sealGroup) expect(m[id]!.some((x) => x.field === "group" && x.text === "SEAL")).toBe(true);
  });

  it("'Ethereum Foundation' does not match every initiative (it matches none in this cohort)", () => {
    const m = matchAffiliations(["Ethereum Foundation"], targets);
    expect(Object.keys(m).length).toBeLessThan(d.initiatives.length);
    expect(Object.keys(m)).toEqual([]);
  });

  it("generic words never match on their own", () => {
    for (const w of ["Labs", "Foundation", "Security", "Protocol", "Ethereum", "Network", "DAO", "Team", "The", "Security Labs", "Protocol Foundation"]) {
      expect(matchAffiliations([w], targets), w).toEqual({});
    }
    for (const w of ["labs", "foundation", "security", "protocol"]) expect(GENERIC_WORDS).toContain(w);
  });

  it("a distinctive word matches with or without generic words around it", () => {
    const blossom = d.initiatives.filter((i) => i.recipientTeam === "Blossom Labs").map((i) => i.id);
    expect(blossom.length).toBeGreaterThan(0);
    expect(Object.keys(matchAffiliations(["Blossom"], targets)).sort()).toEqual(expect.arrayContaining(blossom));
    expect(Object.keys(matchAffiliations(["Blossom Labs Ltd"], targets)).sort()).toEqual(expect.arrayContaining(blossom));
    expect(termMatches("Nethermind Research", "Nethermind")).toBe(true);
    expect(termMatches("Nether", "Nethermind")).toBe(false);
  });

  it("unrelated firms that share one word with an official text match nothing in the cohort", () => {
    // Each of these matched before the rule required the whole entry name (review v1).
    for (const entry of ["Runtime Verification", "Alliance DAO", "Succinct Proof Labs", "Daily Planet", "Remix Records", "Walnut Capital"]) {
      expect(matchAffiliations([entry], targets), entry).toEqual({});
    }
    expect(termMatches("Runtime Verification", "Runtime Capital")).toBe(false);
    expect(termMatches("Alliance DAO", "Security Alliance (SEAL)")).toBe(false);
    expect(termMatches("Walnut Capital", "Walnut")).toBe(false);
    expect(termMatches("Succinct Proof Labs", "Proof of Audits")).toBe(false);
    expect(termMatches("Proof of Audits", "Succinct Proof Labs")).toBe(false);
    // The official text inside a longer entry still counts when it has two distinctive words.
    expect(termMatches("Daily Planet Media", "Daily Planet")).toBe(true);
  });

  it("every official name matches its own initiatives, and only initiatives that carry the same name or a SEAL group", () => {
    for (const s of affiliationSuggestions(targets)) {
      const own = new Set(targets.filter((t) => strictKey(t.text) === strictKey(s)).map((t) => t.initiativeId));
      const m = matchAffiliations([s], targets);
      for (const id of own) expect(m[id], s).toBeTruthy();
      // The only cross-matches come from "(SEAL)" in the name, which is tried as "SEAL".
      for (const id of Object.keys(m)) if (!own.has(id)) expect(sealGroup, s).toContain(id);
    }
  });

  it("optional words are a subset of the generic words", () => {
    for (const w of [...OPTIONAL_WORDS, ...SAME_NAME_OPTIONAL_WORDS]) expect(GENERIC_WORDS).toContain(w);
    for (const w of ["capital", "dao", "protocol", "ventures"]) expect(OPTIONAL_WORDS).not.toContain(w);
    for (const w of ["security", "foundation", "project", "network"]) expect(OPTIONAL_WORDS).toContain(w);
    expect(SAME_NAME_OPTIONAL_WORDS).toEqual(["dao"]);
  });

  it("a full brand name with a generic suffix matches the shorter official text (review v2)", () => {
    // Each matched nothing under the v1 fix, although the official text names the same organization.
    const brands: [string, string][] = [
      ["Nethermind Security", "Nethermind"],
      ["Zealynx Security", "Zealynx"],
      ["Remix Project", "Remix"],
      ["Blockscout Foundation", "Blockscout"],
      ["Kleros DAO", "Kleros"],
      ["Shutter Network", "brainbot (Shutter Network)"],
    ];
    for (const [entry, official] of brands) {
      const own = [...new Set(targets.filter((t) => strictKey(t.text) === strictKey(official)).map((t) => t.initiativeId))].sort();
      expect(own.length, official).toBeGreaterThan(0);
      const m = matchAffiliations([entry], targets);
      expect(Object.keys(m).sort(), entry).toEqual(expect.arrayContaining(own));
      for (const id of own) expect(m[id]!.some((x) => x.text === official), entry).toBe(true);
    }
    // "DAO" may be added only when the official text has no word the entry lacks.
    expect(termMatches("Kleros DAO", "Kleros")).toBe(true);
    expect(termMatches("Kleros DAO", "Kleros Cooperative")).toBe(false);
    expect(termMatches("Alliance DAO", "Security Alliance (SEAL)")).toBe(false);
    expect(termMatches("Alliance DAO", "Security Alliance")).toBe(false);
  });

  it("regression set against the published dataset (review v3)", () => {
    // Unrelated organizations and descriptor or surname words: no flag at all.
    for (const entry of [
      "Runtime Verification",
      "Alliance DAO",
      "Succinct Proof Labs",
      "Daily Planet",
      "Remix Records",
      "Walnut Capital",
      "Intel Foundation",
      "Intel",
      "Bloom Network",
      "Runtime Foundation",
      "Proof Network",
      "Alliance",
      "Ethereum Foundation",
    ]) {
      expect(matchAffiliations([entry], targets), entry).toEqual({});
    }
    // SEAL entries: exactly the SEAL group.
    for (const entry of ["SEAL", "Security Alliance (SEAL)"]) expect(Object.keys(matchAffiliations([entry], targets)).sort(), entry).toEqual(sealGroup);
    // Brand names with a suffix, the alias table and legal forms: still their organizations.
    const own: [string, string][] = [
      ["Nethermind Security", "Nethermind"],
      ["Zealynx Security", "Zealynx"],
      ["Remix Project", "Remix"],
      ["Blockscout Foundation", "Blockscout"],
      ["Kleros DAO", "Kleros"],
      ["Shutter Network", "brainbot (Shutter Network)"],
      ["Blossom Labs Ltd", "Blossom Labs"],
      ["Decurity", "Decurity (Defimon)"],
    ];
    for (const [entry, official] of own) {
      const ids = [...new Set(targets.filter((t) => t.text === official).map((t) => t.initiativeId))].sort();
      expect(ids.length, official).toBeGreaterThan(0);
      expect(Object.keys(matchAffiliations([entry], targets)).sort(), entry).toEqual(ids);
    }
  });

  it("a one-word name matches only where an official name segment starts with it (review v3)", () => {
    expect(termMatches("Intel", "Security Alliance (SEAL) Intel")).toBe(false);
    expect(termMatches("Intel Foundation", "Security Alliance (SEAL) Intel")).toBe(false);
    expect(termMatches("Bloom", "Sem Bloom")).toBe(false);
    expect(termMatches("Bloom Network", "Sem Bloom")).toBe(false);
    expect(termMatches("Alliance", "Security Alliance (SEAL)")).toBe(false);
    expect(termMatches("Alliance", "Security Alliance")).toBe(false);
    expect(termMatches("Hassanine", "Safi El-Hassanine (PRSpec)")).toBe(false);
    // Two different suffixes are two names.
    expect(termMatches("Runtime Foundation", "Runtime Capital")).toBe(false);
    expect(termMatches("Proof Network", "Proof of Audits")).toBe(false);
    expect(termMatches("Kleros Foundation", "Kleros Cooperative")).toBe(false);
    // Segment heads still match.
    expect(termMatches("SEAL", "Security Alliance (SEAL) Intel")).toBe(true);
    expect(termMatches("Security Alliance", "Security Alliance (SEAL) Intel")).toBe(true);
    expect(termMatches("Shutter", "brainbot (Shutter Network)")).toBe(true);
    expect(termMatches("Libp2p", "SEETA, Libp2p")).toBe(true);
    expect(termMatches("Lionscraft", "ValOS-Lionscraft")).toBe(true);
    expect(termMatches("Kann", "Kann Audits")).toBe(true);
    expect(termMatches("Nethermind", "Nethermind")).toBe(true);
    // A number names a program of the same organization.
    expect(Object.keys(matchAffiliations(["SEAL 911"], targets)).sort()).toEqual(sealGroup);
    expect(termMatches("911", "SEAL")).toBe(false);
    expect(nameSegments("Security Alliance (SEAL) Intel")).toEqual(["SEAL", "Security Alliance Intel"]);
    expect(nameSegments("Safi El-Hassanine (PRSpec)")).toEqual(["PRSpec", "Safi El-Hassanine"]);
    expect(nameSegments("ValOS-Lionscraft")).toEqual(["ValOS", "Lionscraft"]);
  });

  it("a manifest group that is a name of one organization carries that organization's other names (review v3)", () => {
    const argot = Object.entries(d.vote.initiativeGroups)
      .filter(([, g]) => g.includes("Argot"))
      .map(([id]) => id)
      .sort();
    expect(argot.length).toBe(2);
    const m = matchAffiliations(["Argot Collective"], targets);
    expect(Object.keys(m).sort()).toEqual(argot);
    expect(matchText(m[argot[0]!]!)).toBe("“Argot Collective” matched manifest affiliation group “Argot” (organization name “Argot Collective”)");
    // SEAL's full name reaches the SEAL initiative whose recipient is another team.
    expect(Object.keys(matchAffiliations(["Security Alliance"], targets)).sort()).toEqual(sealGroup);
    expect(Object.keys(matchAffiliations(["SEAL Security Frameworks"], targets)).sort()).toEqual(sealGroup);
    // A direct group match is shown first.
    expect(matchText(matchAffiliations(["SEAL"], targets)[sealGroup[0]!]!)).toContain("manifest affiliation group “SEAL”");
  });

  it("common organizations outside the cohort match nothing", () => {
    for (const entry of [
      "OpenZeppelin",
      "Trail of Bits",
      "ConsenSys",
      "Sigma Prime",
      "Spearbit",
      "Cantina",
      "Code4rena",
      "Sherlock",
      "Immunefi",
      "Chainlink Labs",
      "Uniswap Labs",
      "Lido DAO",
      "MakerDAO",
      "Optimism Foundation",
      "Arbitrum Foundation",
      "Offchain Labs",
      "Polygon Labs",
      "Gnosis",
      "Safe",
      "StarkWare",
      "Matter Labs",
      "Flashbots",
      "Paradigm",
      "Coinbase",
      "Certora",
      "Halborn",
      "Quantstamp",
      "CertiK",
      "ChainSecurity",
      "Protocol Guild",
      "ENS Labs",
      "MetaMask",
      "WalletConnect",
      "Gitcoin",
      "Etherscan",
      "Tenderly",
      "Forta",
      "Hypernative",
      "Blockaid",
      "Chainalysis",
      "TRM Labs",
      "Ledger",
      "Trezor",
      "Microsoft",
      "Google",
      "Bloom",
      "The DAO",
      "TheDAO Security Fund",
    ]) {
      expect(matchAffiliations([entry], targets), entry).toEqual({});
    }
  });

  it("splits parentheses and matches case-insensitively", () => {
    expect(entryTerms("Security Alliance (SEAL)")).toEqual(["Security Alliance (SEAL)", "SEAL", "Security Alliance"]);
    expect(termMatches("seal", "SEAL Security Frameworks")).toBe(true);
    expect(termMatches("zknox", "ZKNOX")).toBe(true);
  });

  it("uses the published alias table", () => {
    const decurity = d.initiatives.find((i) => i.recipientTeam === "Decurity (Defimon)");
    expect(decurity).toBeTruthy();
    expect(targets.some((t) => t.initiativeId === decurity!.id && t.field === "organization" && t.text === "Decurity")).toBe(true);
    expect(matchAffiliations(["Decurity"], targets)[decurity!.id]).toBeTruthy();
  });

  it("autocomplete suggestions are unique and alphabetical", () => {
    const s = affiliationSuggestions(targets);
    expect(s).toEqual([...s].sort((a, b) => a.localeCompare(b)));
    expect(s).toContain("SEAL");
  });

  it("match text names the entry, the field and the official text", () => {
    const m = matchAffiliations(["SEAL"], targets)[sealGroup[0]!]!;
    expect(matchText(m)).toContain("“SEAL” matched manifest affiliation group “SEAL”");
  });

  it("no manifest group targets when groups are unavailable", () => {
    const off = { ...d, vote: { ...d.vote, groupsAvailable: false, initiativeGroups: {} } } as Dataset;
    expect(affiliationTargets(off).some((t) => t.field === "group")).toBe(false);
    expect(sharedAffiliations(off)).toEqual({});
  });
});

describe("manual overrides", () => {
  const id = sealGroup[0]!;
  const matches = matchAffiliations(["SEAL"], targets);

  it("override wins over the automatic match, and never hides anything", () => {
    expect(affiliationFlag(id, matches, {})?.kind).toBe("matched");
    expect(affiliationFlag(id, matches, { [id]: "not_mine" })?.kind).toBe("dismissed");
    expect(isFlagged(affiliationFlag(id, matches, { [id]: "not_mine" }))).toBe(false);
    const other = d.initiatives.find((i) => !matches[i.id])!.id;
    expect(affiliationFlag(other, matches, {})).toBeNull();
    expect(affiliationFlag(other, matches, { [other]: "mine" })?.kind).toBe("marked");
  });

  it("entries and overrides survive a save and reload of the workspace entry", () => {
    let a = EMPTY_WORKSPACE.affiliations;
    a = addAffiliationEntry(a, "  Security Alliance (SEAL) ");
    a = addAffiliationEntry(a, "security alliance (seal)");
    a = addAffiliationEntry(a, "Blossom Labs");
    a = setAffiliationOverride(a, id, "not_mine");
    a = setAffiliationOverride(a, "01OTHER", "mine");
    const reloaded = WorkspaceSchema.parse(JSON.parse(JSON.stringify({ ...EMPTY_WORKSPACE, affiliations: a })));
    expect(reloaded.affiliations.entries).toEqual(["Security Alliance (SEAL)", "Blossom Labs"]);
    expect(reloaded.affiliations.overrides).toEqual({ [id]: "not_mine", "01OTHER": "mine" });
    const cleared = setAffiliationOverride(removeAffiliationEntry(reloaded.affiliations, "Blossom Labs"), id, null);
    expect(cleared.entries).toEqual(["Security Alliance (SEAL)"]);
    expect(cleared.overrides).toEqual({ "01OTHER": "mine" });
  });

  it("workspaces saved before this feature still parse with empty affiliations and focus", () => {
    const w = WorkspaceSchema.parse({ version: 1 });
    expect(w.affiliations).toEqual({ entries: [], overrides: {}, suggested: false });
    expect(w.interest).toEqual({ focus: [], keywords: [], suggested: false });
  });
});

describe("shared manifest groups", () => {
  const shared = sharedAffiliations(d);

  it("flags exactly the initiatives whose group has another member, never the initiative itself", () => {
    const counts = new Map<string, number>();
    for (const gs of Object.values(d.vote.initiativeGroups)) for (const g of gs) counts.set(g, (counts.get(g) ?? 0) + 1);
    for (const i of d.initiatives) {
      const expected = (d.vote.initiativeGroups[i.id] ?? []).filter((g) => (counts.get(g) ?? 0) > 1);
      expect((shared[i.id] ?? []).map((g) => g.group).sort()).toEqual(expected.sort());
      for (const g of shared[i.id] ?? []) {
        expect(g.peers.some((p) => p.id === i.id)).toBe(false);
        expect(g.peers.length).toBe((counts.get(g.group) ?? 0) - 1);
        expect(g.peers.map((p) => p.label)).toEqual([...g.peers.map((p) => p.label)].sort((a, b) => a.localeCompare(b)));
      }
    }
  });

  it("SEAL initiatives list each other", () => {
    for (const id of sealGroup) expect(peersOf(shared[id]!).map((p) => p.id).sort()).toEqual(sealGroup.filter((x) => x !== id));
  });
});

describe("wording", () => {
  it("fixed texts are neutral and use the specified wording", () => {
    expect(MAY_BE_AFFILIATED).toBe("You may be affiliated");
    expect(POSSIBLY_OWN).toBe("Possibly your own or affiliated");
    expect(AFFILIATED_WITH).toBe("Affiliated with:");
    for (const t of [MAY_BE_AFFILIATED, MARKED_AFFILIATED, POSSIBLY_OWN, S_TIER_REMINDER, GROUPS_OFF_NOTE, AFFILIATED_WITH]) expect(isNeutral(t), t).toBe(true);
  });
});
