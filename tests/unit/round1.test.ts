/**
 * Round 1 history: parsing of the TheDAO transparency report, the conservative matcher (exact,
 * alias, same website, possible and no-match cases) and equal treatment across the cohort.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { loadPublishedDataset } from "@/lib/db/file-store";
import { isCoiOrganization } from "@/lib/disclosure";
import type { CuratedAlias } from "@/lib/domain/identity";
import type { Dataset, Round1Project } from "@/lib/domain/schemas";
import { computeRound1Matches, expandNames, matchRound1, ROUND1_EMPTY_TEXT, round1Slug, type Round1Subject } from "@/lib/intelligence/round1";
import { round1ForOrganization, round1History } from "@/lib/intelligence/service";
import { decimalToCents, extractCsvFromBundle, parseCsv, parseForumTopic, parseRound1, parseRound1Csv, readRound1Manifest, readRound1Raw, ROUND1_CSV_HEADER } from "@/research/round1";

const ROOT = path.resolve(import.meta.dirname, "../..");
const CHECKED = "2026-11-27T00:00:00.000Z";

function proj(name: string, website: string | null, extra: Partial<Round1Project> = {}): Round1Project {
  return {
    id: `r1_${round1Slug(name)}`,
    name,
    slug: round1Slug(name),
    transparencyUrl: `https://thedao.fund/transparency/${round1Slug(name)}`,
    website,
    totalEth: "1.0",
    usdWhenSentCents: 200_000,
    components: { matchingPoolEth: "0.5", extraRoundInflowEth: "0.3", otherDonorsEth: "0.2", otherDonorsUsdCents: 40_000 },
    progressUpdateUrl: null,
    displayed: { totalEth: "1.0000", usdWhenSentCents: 200_000, asOf: CHECKED },
    directGrants: [],
    liveStream: null,
    sourceUrls: [`https://thedao.fund/transparency/${round1Slug(name)}`, "https://thedao.fund/transparency"],
    checkedAt: CHECKED,
    ...extra,
  };
}

function subject(s: Partial<Round1Subject> & { official?: string[] }, aliases: CuratedAlias[] = []): Round1Subject {
  return {
    names: expandNames(s.official ?? [], aliases),
    primaryUrls: s.primaryUrls ?? [],
    organizationUrls: s.organizationUrls ?? [],
    proposalLinks: s.proposalLinks ?? [],
    proposalUrl: s.proposalUrl ?? "https://initiatives.thedao.fund/initiative/example",
    titles: s.titles ?? [],
  };
}

describe("parsing the transparency report", () => {
  const row = (name: string) => `${name},0.5,0.3,0.2,400.0,1.0,2000.0,https://example.org,`;

  it("parses quoted fields with commas, doubled quotes and CRLF line ends", () => {
    const rows = parseCsv(`a,b\r\n"OSs Security - Hardening for macOs, Linux & Windows","say ""hi"""\r\nx,\r\n`);
    expect(rows).toEqual([["a", "b"], ["OSs Security - Hardening for macOs, Linux & Windows", 'say "hi"'], ["x", ""]]);
  });

  it("requires the header and exactly the expected number of rows (135 for the real report)", () => {
    const csv = [ROUND1_CSV_HEADER, row('"A, with comma"'), row("B")].join("\r\n");
    const parsed = parseRound1Csv(csv, 2);
    expect(parsed.map((r) => r.name)).toEqual(["A, with comma", "B"]);
    expect(parsed[1]!.progressUpdate).toBe("");
    expect(() => parseRound1Csv(csv)).toThrow("expected 135 rows, got 2");
    expect(() => parseRound1Csv(csv.replace("project_name", "name"), 2)).toThrow(/unexpected header/);
    expect(() => parseRound1Csv([ROUND1_CSV_HEADER, "C,abc,0,0,0,0,0,,"].join("\n"), 1)).toThrow(/malformed number/);
  });

  it("decodes the CSV template literal from a route bundle and refuses substitutions", () => {
    const js = `const a=1,Yr=\`${ROUND1_CSV_HEADER}\\r\nB,0.5,0.3,0.2,400.0,1.0,2000.0,https://example.org,\\r\n\`,qr="x";`;
    expect(parseRound1Csv(extractCsvFromBundle(js), 1)[0]!.name).toBe("B");
    expect(() => extractCsvFromBundle("const x=`" + ROUND1_CSV_HEADER + "\n${evil}`")).toThrow(/substitutions/);
    expect(() => extractCsvFromBundle("no csv here")).toThrow(/not found/);
  });

  it("converts decimal amounts to integer cents without floating point", () => {
    expect(decimalToCents("73532.0")).toBe(7_353_200);
    expect(decimalToCents("269930.11")).toBe(26_993_011);
    expect(decimalToCents("$1,945,347")).toBe(194_534_700);
  });

  it("reads 135 records from the stored raw copies, each with a source URL and checked-on date", async () => {
    const m = await readRound1Manifest();
    expect(m).not.toBeNull();
    const raw = await readRound1Raw(m!);
    const html = m!.sources.find((s) => s.key === "transparency_html")!;
    const r = parseRound1(raw!, html.retrievedAt);
    expect(r.projects).toHaveLength(135);
    for (const p of r.projects) {
      expect(p.sourceUrls.length, p.name).toBeGreaterThan(0);
      expect(p.sourceUrls).toContain(p.transparencyUrl);
      expect(p.checkedAt).toBe(html.retrievedAt);
    }
    expect(r.projects.some((p) => p.name === "OSs Security - Hardening for macOs, Linux & Windows")).toBe(true);
    expect(r.pageTotals?.projects).toBe(135);
    // Missing progress updates stay empty (null), never a word.
    const withoutUpdate = r.projects.filter((p) => p.progressUpdateUrl === null);
    expect(withoutUpdate.length).toBeGreaterThan(0);
    // The SEAL rows: 0 ETH QF total for "SEAL" but a direct grant and a live stream are recorded.
    const seal = r.projects.find((p) => p.name === "SEAL")!;
    expect(seal.totalEth).toBe("0.0");
    expect(seal.directGrants.length).toBe(1);
    expect(seal.liveStream).not.toBeNull();
    const round = parseForumTopic(raw!.forum!);
    expect(round.period).toBe("April 23 to May 14, 2026");
    expect(round.eligibleProjects).toBe(134);
    expect(round.distributionAnnouncedAt).toBe("2026-06-09");
    expect(round.distributionTxUrls).toHaveLength(4);
  });
});

describe("matching", () => {
  const assertions = proj("Assertions.eth On-chain Transaction Guards for Ethereum", "https://assertions.eth.limo");
  const echidna = proj("Echidna: A Fast Smart Contract Fuzzer", "https://secure-contracts.com/program-analysis/echidna/index.html");
  const zealynx = proj("Zealynx Academy", "https://academy.zealynx.io/");
  const page = proj("Wallet Security Ranking", "https://www.coinspect.com/wallets/");
  const repo = proj("Safe Multisig Transaction Hashes", "https://github.com/pcaversaccio/safe-tx-hashes-util");
  const generic = proj("Ethereum Security Toolkit", "https://example-toolkit.dev");
  const all = [assertions, echidna, zealynx, page, repo, generic];

  it("exact match: the proposal links to the project's transparency page", () => {
    const m = matchRound1(all, subject({ official: ["Blossom Labs"], primaryUrls: ["https://blossom.software"], proposalLinks: [assertions.transparencyUrl] }));
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ projectId: assertions.id, status: "match", level: "project" });
    expect(m[0]!.reasons[0]!.text).toBe("The proposal links to this Round 1 record");
    expect(m[0]!.sourceUrls).toContain(assertions.transparencyUrl);
    expect(m[0]!.checkedAt).toBe(CHECKED);
  });

  it("exact match: the proposal links to the Giveth project page with this project's name", () => {
    const wake = proj("Wake: Solidity static analysis and fuzzing framework", "https://twitter.com/WakeFramework");
    const m = matchRound1([wake], subject({ official: ["ack3"], proposalLinks: ["https://qf.giveth.io/project/wake:-solidity-static-analysis-and-fuzzing-framework?roundId=16"] }));
    expect(m[0]).toMatchObject({ status: "match", level: "project" });
    expect(m[0]!.reasons[0]!.rule).toBe("proposal_links_giveth_project");
  });

  it("same website: the same non-root page is project level, the same host organization level", () => {
    const samePage = matchRound1([page], subject({ official: ["Coinspect"], primaryUrls: ["https://coinspect.com/wallets"] }));
    expect(samePage[0]).toMatchObject({ status: "match", level: "project" });
    expect(samePage[0]!.reasons[0]!.text).toBe("Listed under the same website page (https://www.coinspect.com/wallets/)");
    const sameHost = matchRound1([page], subject({ official: ["Coinspect"], organizationUrls: ["https://www.coinspect.com/"] }));
    expect(sameHost[0]).toMatchObject({ status: "match", level: "organization" });
    expect(sameHost[0]!.reasons[0]!.text).toBe("Listed under the same website (coinspect.com)");
    // A different subdomain is a different host.
    expect(matchRound1([zealynx], subject({ official: ["Other"], organizationUrls: ["https://www.zealynx.io/"] }))).toEqual([]);
  });

  it("shared hosts never match on the host alone; GitHub needs the same owner or repository", () => {
    expect(matchRound1([repo], subject({ official: ["Someone"], primaryUrls: ["https://github.com/other-owner/tool"] }))).toEqual([]);
    const owner = matchRound1([repo], subject({ official: ["Someone"], organizationUrls: ["https://github.com/pcaversaccio"] }));
    expect(owner[0]).toMatchObject({ status: "match", level: "organization" });
    expect(owner[0]!.reasons[0]!.text).toBe("Same GitHub owner (pcaversaccio)");
    const same = matchRound1([repo], subject({ official: ["Someone"], primaryUrls: ["https://github.com/pcaversaccio/safe-tx-hashes-util"] }));
    expect(same[0]).toMatchObject({ status: "match", level: "project" });
    const x = proj("Plamen AI Security Researcher", "https://x.com/p_tsanev");
    expect(matchRound1([x], subject({ official: ["Someone"], organizationUrls: ["https://x.com/someone_else"] }))).toEqual([]);
  });

  it("alias match: a name recorded for the same organization in data/curated/aliases.json", async () => {
    const aliases = JSON.parse(await fs.readFile(path.join(ROOT, "data/curated/aliases.json"), "utf8")) as CuratedAlias[];
    const sealRow = proj("SEAL", "https://example-not-shared.org");
    // The official recipient label is "Security Alliance (SEAL) Intel"; the alias table records "SEAL" for the same organization.
    const m = matchRound1([sealRow], subject({ official: ["Security Alliance (SEAL) Intel"] }, aliases));
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ status: "match", level: "organization" });
    expect(m[0]!.reasons[0]!.text).toBe('Same organization name through the alias table ("SEAL" is recorded as Security Alliance (SEAL))');
    // Without the alias table the shared word "SEAL" alone gives only a possible match.
    expect(matchRound1([sealRow], subject({ official: ["Security Alliance (SEAL) Intel"] })).map((x) => x.status)).toEqual(["possible"]);
  });

  it("same organization name uses the segment before ':' or ' - ' and around ' by '", () => {
    const rows = [proj("Defimon - real-time DeFi security", null), proj("Open-Source AI Security Triage by HackenProof", null), proj("Blobscan", null)];
    expect(matchRound1(rows, subject({ official: ["Defimon"] })).map((m) => m.round1ProjectName)).toEqual(["Defimon - real-time DeFi security"]);
    expect(matchRound1(rows, subject({ official: ["HackenProof"] }))[0]!.reasons[0]!.text).toBe('Same organization name ("HackenProof")');
    expect(matchRound1(rows, subject({ official: ["BlobScan"] }))[0]!.round1ProjectName).toBe("Blobscan");
  });

  it("ambiguous: a distinctive shared name is only a possible match, with both links", () => {
    const m = matchRound1(all, subject({ official: ["Gustavo Grieco"], titles: ["Fund Echidna development through 2027"], proposalUrl: "https://initiatives.thedao.fund/initiative/fund-echidna" }));
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ projectId: echidna.id, status: "possible" });
    expect(m[0]!.reasons.every((r) => r.rule === "shared_name_token")).toBe(true);
    expect(m[0]!.sourceUrls).toEqual(expect.arrayContaining(["https://initiatives.thedao.fund/initiative/fund-echidna", echidna.transparencyUrl]));
  });

  it("generic words never produce a match or a possible match", () => {
    expect(matchRound1([generic], subject({ official: ["Open Security Labs"], titles: ["Ethereum security toolkit for wallets"] }))).toEqual([]);
  });

  it("similarly named entities without evidence are not merged (Runtime Capital vs runtimeverification.com)", () => {
    const k = proj("K Stack: The Formal Verification Layer for Ethereum", "https://runtimeverification.com/");
    expect(matchRound1([k], subject({ official: ["Runtime Capital"], organizationUrls: ["https://www.runtime.capital/"], titles: ["Safe lockdown guard"] }))).toEqual([]);
  });

  it("an organization with several Round 1 projects lists each with its own reason, alphabetically", () => {
    const seal = [
      proj("SEAL 911", "https://securityalliance.org/"),
      proj("SEAL", "https://securityalliance.org", { totalEth: "0.0", usdWhenSentCents: 0 }),
      proj("SEAL Intel", "https://securityalliance.org/our-work/seal-intel"),
      proj("SEAL Frameworks", "https://securityalliance.org/our-work/certifications"),
    ];
    const m = matchRound1(seal, subject({ official: ["SEAL", "Security Alliance (SEAL)"], organizationUrls: ["https://securityalliance.org/"] }));
    expect(m.map((x) => x.round1ProjectName)).toEqual(["SEAL", "SEAL 911", "SEAL Frameworks", "SEAL Intel"]);
    expect(m.every((x) => x.status === "match" && x.reasons.length > 0)).toBe(true);
    expect(m[0]!.reasons.map((r) => r.text)).toEqual(["Listed under the same website (securityalliance.org)", 'Same organization name ("SEAL")']);
  });

  it("no evidence: no records", () => {
    expect(matchRound1(all, subject({ official: ["Nethermind"], primaryUrls: ["https://www.nethermind.io/"] }))).toEqual([]);
  });
});

describe("Round 1 history on the published dataset", () => {
  let d: Dataset;
  beforeAll(async () => {
    d = await loadPublishedDataset();
  });

  it("publishes 135 records, each with a source URL and checked-on date", () => {
    expect(d.round1.status).toBe("available");
    expect(d.round1.projects).toHaveLength(135);
    for (const p of d.round1.projects) {
      expect(p.sourceUrls.length).toBeGreaterThan(0);
      expect(p.checkedAt).toBe(d.round1.checkedAt);
    }
    for (const ms of [...Object.values(d.round1.initiativeMatches), ...Object.values(d.round1.organizationMatches)])
      for (const m of ms) {
        expect(m.reasons.length).toBeGreaterThan(0);
        expect(m.sourceUrls.length).toBeGreaterThan(0);
        expect(m.checkedAt).toBeTruthy();
      }
  });

  it("gives every initiative, including the conflict-of-interest one, a result from the same function", async () => {
    const aliases = JSON.parse(await fs.readFile(path.join(ROOT, "data/curated/aliases.json"), "utf8")) as CuratedAlias[];
    const fresh = computeRound1Matches(d.round1.projects, d.initiatives, d.organizations, aliases);
    const keys = (v: object) => Object.keys(v).sort();
    const reference = keys(round1History(d, d.initiatives[0]!.id)!);
    for (const ini of d.initiatives) {
      const v = round1History(d, ini.id)!;
      expect(keys(v), ini.slug).toEqual(reference);
      expect(v.records.map((r) => r.projectId), ini.slug).toEqual((fresh.initiativeMatches[ini.id] ?? []).map((m) => m.projectId));
      expect(v.emptyText).toBe(ROUND1_EMPTY_TEXT);
    }
    const coi = d.initiatives.filter((i) => isCoiOrganization(i.organizationId));
    expect(coi).toHaveLength(1);
    expect(round1History(d, coi[0]!.id)!.records).toEqual((fresh.initiativeMatches[coi[0]!.id] ?? []).map((m) => ({ ...m, project: d.round1.projects.find((p) => p.id === m.projectId) })));
    for (const o of d.organizations) expect(round1ForOrganization(d, o.id)!.records.length, o.id).toBe((fresh.organizationMatches[o.id] ?? []).length);
  });

  it("finds the records the proposals link to and lists SEAL's projects", () => {
    const names = (slugPrefix: string) => round1History(d, d.initiatives.find((i) => i.slug.startsWith(slugPrefix))!.id)!.records.map((r) => `${r.status}:${r.round1ProjectName}`);
    expect(names("assertions-for-safes")).toEqual(["match:Assertions.eth On-chain Transaction Guards for Ethereum"]);
    expect(names("scar-test-security-fixes")).toEqual(["match:SCAR: AI Retrieval for Smart Contract Security"]);
    expect(names("seal-intel")).toEqual(["match:SEAL", "match:SEAL 911", "match:SEAL Certifications", "match:SEAL Frameworks", "match:SEAL Intel", "match:SEAL Safe Harbor"]);
    expect(names("fund-echidna")).toEqual(["possible:Echidna: A Fast Smart Contract Fuzzer"]);
    expect(names("safe-lockdown-guard")).toEqual([]);
    for (const rfp of d.initiatives.filter((i) => i.type === "rfp")) expect(round1History(d, rfp.id)!.records, rfp.slug).toEqual([]);
  });
});
