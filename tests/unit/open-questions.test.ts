/**
 * Open questions (Item 11, open-questions@1): one positive and one negative fixture per rule,
 * identical wording across initiatives, the conservative self-pledge check, stable ids,
 * deterministic order, the aggregate view, the workspace marks and the no-outreach scan.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { EMPTY_WORKSPACE, parseImport, setOpenQuestionMark, WorkspaceSchema } from "@/components/workspace/schema";
import { loadPublishedDataset } from "@/lib/db/file-store";
import { isCoiOrganization } from "@/lib/disclosure";
import type { Claim, Dataset, Initiative, Milestone, Organization, Pledge } from "@/lib/domain/schemas";
import {
  cohortPartyLexicon,
  isProductLink,
  isRepositoryLink,
  listedNames,
  namedParties,
  OPEN_QUESTION_CATEGORIES,
  OPEN_QUESTION_NOTICE,
  OPEN_QUESTION_RULES,
  openQuestions,
  questionsAsText,
  RULE_FUNCTIONS,
  ruleAdoptionNamedParty,
  ruleExistingClaimWithoutLink,
  ruleMilestoneNoTargetDate,
  ruleNoMilestoneReviewer,
  ruleNoRepositoryOrProductLink,
  rulePledgeNotReceived,
  rulePossibleSelfPledge,
  ruleRfpNoRecipient,
  type OpenQuestionInput,
} from "@/lib/intelligence/open-questions";
import { openQuestionRows, openQuestionsFor } from "@/lib/intelligence/service";
import { findBannedPhrases } from "@/lib/neutralLanguage";

const ROOT = path.resolve(import.meta.dirname, "../..");
let d: Dataset;
let baseIni: Initiative;
let baseMs: Milestone;
let basePledge: Pledge;
let baseClaim: Claim;
let baseOrg: Organization;

beforeAll(async () => {
  d = await loadPublishedDataset();
  baseIni = d.initiatives.find((i) => i.type === "grant")!;
  baseMs = d.milestones[0]!;
  basePledge = d.pledges[0]!;
  baseClaim = d.claims.find((c) => c.kind === "integration")!;
  baseOrg = d.organizations[0]!;
});

const URL_A = "https://initiatives.thedao.fund/initiative/fixture-a";

function ini(o: Partial<Initiative> = {}): Initiative {
  return {
    ...baseIni,
    id: "ini_a",
    slug: "fixture-a",
    title: "Fixture A",
    shortTitle: "Fixture A",
    type: "grant",
    url: URL_A,
    recipientTeam: "Acme Labs",
    recipientUrl: "https://acme.example/",
    organizationId: "org_acme",
    milestoneReviewer: "Jane Reviewer",
    links: ["https://github.com/acme/tool"],
    textLinks: [],
    ...o,
  };
}
const ms = (index: number, o: Partial<Milestone> = {}): Milestone => ({ ...baseMs, id: `ms_${index}`, initiativeId: "ini_a", index, name: `Milestone name ${index}`, adoption: false, done: false, targetMonth: "2027-03", criteria: ["A thing is published."], ...o });
const pledge = (id: string, company: string, status: Pledge["status"] = "pledged"): Pledge => ({ ...basePledge, id, initiativeId: "ini_a", company, status, amountCents: 1_000_000, createdAt: "2026-11-01T00:00:00.000Z" });
const claim = (id: string, o: Partial<Claim> = {}): Claim => ({ ...baseClaim, id, initiativeId: "ini_a", kind: "integration", status: "applicant_reported", section: "why_grant", quote: "The tool is integrated with Example Wallet and used in production.", sourceUrls: [URL_A], supportingEvidenceIds: [], ...o });
const org = (name: string, names: string[] = [name], website: string | null = null): Organization => ({ ...baseOrg, id: "org_acme", name, names, website, anonymous: false });

function input(o: Partial<OpenQuestionInput> = {}): OpenQuestionInput {
  return { initiative: ini(), organization: org("Acme Labs"), milestones: [ms(0)], pledges: [], claims: [], lexicon: [], ...o };
}

describe("rule 1: milestone without a target date", () => {
  it("asks for an open milestone with no targetMonth, quoting its name", () => {
    const q = ruleMilestoneNoTargetDate(input({ milestones: [ms(0), ms(2, { targetMonth: null, name: "Audit round" })] }));
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ question: "Is there a target date for milestone 3?", category: "Timeline", field: "milestones[2].targetMonth", value: "Not recorded", quotes: ["Audit round"], sourceUrl: URL_A, ruleNumber: 1 });
  });
  it("does not ask when the month is recorded or the milestone is complete", () => {
    expect(ruleMilestoneNoTargetDate(input({ milestones: [ms(0), ms(1, { targetMonth: null, done: true })] }))).toEqual([]);
  });
});

describe("rule 2: RFP without a recipient team", () => {
  it("asks who is expected to deliver", () => {
    const q = ruleRfpNoRecipient(input({ initiative: ini({ type: "rfp", recipientTeam: null }), organization: null }));
    expect(q.map((x) => [x.question, x.category, x.field])).toEqual([["Who is expected to deliver?", "Delivery", "recipientTeam"]]);
  });
  it("does not ask for grants or for an RFP that names a team", () => {
    expect(ruleRfpNoRecipient(input())).toEqual([]);
    expect(ruleRfpNoRecipient(input({ initiative: ini({ type: "rfp", recipientTeam: "Selected Team" }) }))).toEqual([]);
  });
});

describe("rule 3: no repository or product link", () => {
  it("asks when no link is a repository or on the recipient's domain, listing the domains found", () => {
    const q = ruleNoRepositoryOrProductLink(input({ initiative: ini({ links: ["https://news.example.org/story", "https://github.com/acme"], textLinks: [{ url: "https://x.com/acme/status/1", text: null, section: "why" }], recipientUrl: null }), organization: org("Acme Labs") }));
    expect(q).toHaveLength(1);
    expect(q[0]!.question).toBe("Is there a public repository or product link for this work?");
    expect(q[0]!.category).toBe("Evidence");
    expect(q[0]!.details[0]).toBe("Linked domains: example.org, github.com/acme, x.com/acme");
    expect(ruleNoRepositoryOrProductLink(input({ initiative: ini({ links: [], textLinks: [] }) }))[0]!.value).toBe("No links in the official record or the proposal text");
  });
  it("does not ask when a repository, the recipient's domain or a domain named after the recipient is linked", () => {
    expect(ruleNoRepositoryOrProductLink(input())).toEqual([]);
    expect(ruleNoRepositoryOrProductLink(input({ initiative: ini({ links: [], textLinks: [{ url: "https://docs.acme.example/guide", text: "Docs", section: "why_grant" }] }) }))).toEqual([]);
    expect(ruleNoRepositoryOrProductLink(input({ initiative: ini({ recipientTeam: "Owney", recipientUrl: null, links: ["https://risk.owney.app/"] }), organization: org("Owney") }))).toEqual([]);
  });
  it("classifies links conservatively", () => {
    expect(isRepositoryLink("https://github.com/acme/tool")).toBe(true);
    expect(isRepositoryLink("https://gitlab.com/acme/tool/-/tree/main")).toBe(true);
    expect(isRepositoryLink("https://github.com/acme")).toBe(false);
    expect(isProductLink("https://labs.example/", ini({ recipientUrl: null, recipientTeam: "Acme Labs" }), org("Acme Labs"))).toBe(false);
    expect(isProductLink("https://acmelabs.io/", ini({ recipientUrl: null, recipientTeam: "Acme Labs" }), org("Acme Labs"))).toBe(true);
  });
});

describe("rule 4: adoption milestone naming a third party", () => {
  const adoption = (criteria: string[]) => ms(3, { adoption: true, criteria, name: "Adoption" });
  it("asks when the criteria name parties in a list and quotes the criterion", () => {
    const c = "At least 3 wallets outside Acme run the API, one of them must be: Ledger, Rabby, Trust Wallet, Safe, each shown by a public announcement.";
    const q = ruleAdoptionNamedParty(input({ milestones: [adoption([c, "A guide is published."])] }));
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ question: "Has any party named in milestone 4 confirmed the adoption it describes?", category: "Adoption", quotes: [c] });
    expect(q[0]!.details).toEqual(["Named in the criteria: Ledger, Rabby, Trust Wallet, Safe"]);
  });
  it("does not ask for generic or excluded parties, numbers, the recipient itself, or non-adoption milestones", () => {
    const generic = adoption([
      "At least 10 accounts outside Blossom Labs and TheDAO Security Fund, controlling at least $10,000,000 combined, each execute a transaction on Ethereum or an L2.",
      "At least 6 organizations outside Kleros and Seer use the market.",
      "At least 5 teams run it on Ethereum or L2s; Acme Labs staff are excluded.",
      "At least 1 team outside Acme completes two audits of a mainnet Safe it governs with Delay or Roles v2.1.1 enabled.",
    ]);
    expect(ruleAdoptionNamedParty(input({ milestones: [generic] }))).toEqual([]);
    expect(ruleAdoptionNamedParty(input({ milestones: [ms(1, { criteria: ["From this list: Ledger, Rabby, Trezor."] })] }))).toEqual([]);
    expect(ruleAdoptionNamedParty(input({ milestones: [adoption(["Partners from this list: Acme Labs, Acme."])] }))).toEqual([]);
  });
  it("finds names known from cohort lists when mentioned on their own, but never list-only words", () => {
    const m = adoption(["Ledger ships the verifier in its app.", "A mainnet Safe uses it."]);
    expect(namedParties(m, ["Acme Labs"], ["Ledger", "Safe"]).parties).toEqual(["Ledger"]);
    expect(namedParties(m, ["Acme Labs"], []).parties).toEqual([]);
  });
  it("extracts list names, including parenthesized lists and partial first and last items", () => {
    expect(listedNames("Integration is completed with at least 3 of the 5 providers (Tenderly, Foundry, Hardhat, Medusa, Remix)")).toEqual(["Tenderly", "Foundry", "Hardhat", "Medusa", "Remix"]);
    expect(listedNames("1 of them from the Robinhood Chain, Ink, Base or Mantle teams")).toEqual(["Robinhood Chain", "Ink", "Base", "Mantle"]);
    expect(listedNames("publicly confirmed by those teams (must include Nethermind and Geth)")).toEqual(["Nethermind", "Geth"]);
    expect(listedNames("The disclosures span at least 4 of these verticals: Ethereum clients, rollups and infrastructure, DeFi, wallets, AI and crypto")).toEqual([]);
    expect(listedNames("baseline 1,172 wallets for June 19 to September 17, 2026")).toEqual([]);
  });
});

describe("rule 5: possible self-pledge", () => {
  it("asks when the backer name equals or contains the recipient name, labeled unverified", () => {
    const q = rulePossibleSelfPledge(input({ pledges: [pledge("p1", "Acme Labs"), pledge("p2", "Acme Labs Foundation", "received"), pledge("p3", "Other Fund")] }));
    expect(q.map((x) => x.question)).toEqual([
      "Can the team confirm whether the pledge from Acme Labs is a self-pledge? (possible self-pledge, unverified)",
      "Can the team confirm whether the pledge from Acme Labs Foundation is a self-pledge? (possible self-pledge, unverified)",
    ]);
    expect(q.every((x) => x.category === "Funding" && x.details.includes("Name overlap only; not verified"))).toBe(true);
  });
  it("is conservative: a name inside a longer word never matches, and RFPs without a team never match", () => {
    expect(rulePossibleSelfPledge(input({ initiative: ini({ recipientTeam: "Safe" }), organization: org("Safe"), pledges: [pledge("p1", "SafeGuard Capital")] }))).toEqual([]);
    expect(rulePossibleSelfPledge(input({ initiative: ini({ type: "rfp", recipientTeam: null }), organization: null, pledges: [pledge("p1", "Acme Labs")] }))).toEqual([]);
  });
});

describe("rule 6: pledged, not yet received", () => {
  it("asks once per pledge record with status pledged", () => {
    const q = rulePledgeNotReceived(input({ pledges: [pledge("p1", "Beta Fund"), pledge("p2", "Gamma DAO", "received")] }));
    expect(q.map((x) => [x.question, x.category, x.ref])).toEqual([["Is there an expected date for the pledged amount from Beta Fund to be received?", "Funding", "p1"]]);
    expect(q[0]!.value).toBe("pledged ($10,000), not marked received");
  });
  it("does not ask when every pledge is received", () => {
    expect(rulePledgeNotReceived(input({ pledges: [pledge("p2", "Gamma DAO", "received")] }))).toEqual([]);
  });
});

describe("rule 7: no named milestone reviewer", () => {
  it("asks when milestoneReviewer is empty", () => {
    expect(ruleNoMilestoneReviewer(input({ initiative: ini({ milestoneReviewer: null }) })).map((x) => [x.question, x.category])).toEqual([["Who will review the milestones?", "Delivery"]]);
    expect(ruleNoMilestoneReviewer(input({ initiative: ini({ milestoneReviewer: "  " }) }))).toHaveLength(1);
  });
  it("does not ask when a reviewer is named", () => {
    expect(ruleNoMilestoneReviewer(input())).toEqual([]);
  });
});

describe("rule 8: existing functionality without a link", () => {
  it("asks for an existing-integration statement with no link and no supporting evidence, quoting it as an applicant statement", () => {
    const q = ruleExistingClaimWithoutLink(input({ claims: [claim("c1")] }));
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ question: "Is there a public link that shows the quoted statement?", category: "Evidence", quoteKind: "applicant", sourceKind: "applicant", sourceUrl: `${URL_A}#why_grant` });
    expect(q[0]!.quotes).toEqual(["The tool is integrated with Example Wallet and used in production."]);
  });
  it("does not ask when the sentence links a source, writes a link out, has support, is planned or sits in a commitments section", () => {
    const none = [
      claim("c1", { sourceUrls: [URL_A, "https://example.org/announcement"] }),
      claim("c2", { quote: "Descriptors live in the open registry at github.com/ethereum/registry, and wallets read them." }),
      claim("c3", { supportingEvidenceIds: ["ev_1"] }),
      claim("c4", { status: "future_target" }),
      claim("c5", { section: "commitments" }),
      claim("c6", { kind: "quantitative" }),
    ];
    expect(ruleExistingClaimWithoutLink(input({ claims: none }))).toEqual([]);
    // A bare domain used as a company name is not a link.
    expect(ruleExistingClaimWithoutLink(input({ claims: [claim("c7", { quote: "It is integrated in Ambire and beel.com (formerly Tokenize.it)." })] }))).toHaveLength(1);
  });
});

describe("all rules", () => {
  it("covers exactly the eight rules with fixed templates and the five categories", () => {
    expect(OPEN_QUESTION_RULES.map((r) => r.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(Object.keys(RULE_FUNCTIONS).sort()).toEqual(OPEN_QUESTION_RULES.map((r) => r.id).sort());
    expect([...new Set(OPEN_QUESTION_RULES.map((r) => r.category))].sort()).toEqual([...OPEN_QUESTION_CATEGORIES].sort());
    for (const r of OPEN_QUESTION_RULES) expect(findBannedPhrases(r.template)).toEqual([]);
    expect(OPEN_QUESTION_NOTICE).toBe("A question is not an accusation and not a finding that something is wrong.");
  });

  it("uses the same wording for two different initiatives (template equality)", () => {
    const gap = (id: string, team: string) =>
      openQuestions({
        initiative: ini({ id, slug: id, title: id, recipientTeam: team, milestoneReviewer: null, links: [], textLinks: [], recipientUrl: null }),
        organization: org(team),
        milestones: [ms(0, { targetMonth: null, initiativeId: id })],
        pledges: [{ ...pledge(`${id}_p`, "Neutral Backer"), initiativeId: id }],
        claims: [],
        lexicon: [],
      });
    const a = gap("ini_one", "Alpha Team");
    const b = gap("ini_two", "Beta Works");
    expect(a.map((q) => [q.ruleId, q.question, q.category])).toEqual(b.map((q) => [q.ruleId, q.question, q.category]));
    expect(new Set(a.map((q) => q.id)).size).toBe(a.length);
    expect(a.some((q) => b.some((x) => x.id === q.id))).toBe(false);
  });

  it("orders by category, then rule, then record, and is deterministic with stable ids", () => {
    const x = input({ initiative: ini({ milestoneReviewer: null, type: "rfp", recipientTeam: null }), organization: null, milestones: [ms(2, { targetMonth: null }), ms(0, { targetMonth: null })], pledges: [pledge("p2", "Zeta"), pledge("p1", "Alpha")] });
    const a = openQuestions(x);
    const b = openQuestions({ ...x, milestones: [...x.milestones].reverse(), pledges: [...x.pledges].reverse() });
    expect(a).toEqual(b);
    expect(a.map((q) => q.category)).toEqual(["Timeline", "Timeline", "Delivery", "Delivery", "Funding", "Funding"]);
    expect(a.map((q) => q.ruleNumber)).toEqual([1, 1, 2, 7, 6, 6]);
    expect(a[0]!.question).toBe("Is there a target date for milestone 1?");
    expect(a.slice(4).map((q) => q.ref)).toEqual(["p1", "p2"]);
    expect(a[0]!.id).toMatch(/^oq_[0-9a-f]{16}$/);
  });

  it("formats Copy as list as plain text with category and source link", () => {
    const qs = openQuestions(input({ initiative: ini({ milestoneReviewer: null }) }));
    expect(questionsAsText("Fixture A", qs)).toBe(`Open questions: Fixture A\n${OPEN_QUESTION_NOTICE}\n\n1. Who will review the milestones? (Delivery; source: ${URL_A})`);
  });
});

describe("real dataset", () => {
  it("raises only questions whose source facts hold in the published record", () => {
    const lexicon = cohortPartyLexicon(d.milestones, d.organizations);
    for (const i of d.initiatives) {
      const qs = openQuestionsFor(d, i.id)!;
      for (const q of qs) {
        expect(findBannedPhrases(q.question)).toEqual([]);
        expect(q.sourceUrl).toMatch(/^https:\/\//);
        const m = d.milestones.find((x) => x.id === q.ref);
        if (q.ruleId === "milestone_no_target_date") expect(m && !m.targetMonth && !m.done).toBe(true);
        if (q.ruleId === "adoption_named_party") {
          expect(m?.adoption).toBe(true);
          const names = q.details[0]!.replace("Named in the criteria: ", "").split(", ");
          for (const n of names) expect(q.quotes.some((c) => c.includes(n))).toBe(true);
          for (const c of q.quotes) expect(m!.criteria).toContain(c);
        }
        if (q.ruleId === "pledge_not_received") expect(d.pledges.find((p) => p.id === q.ref)?.status).toBe("pledged");
        if (q.ruleId === "no_milestone_reviewer") expect(i.milestoneReviewer).toBeNull();
        if (q.ruleId === "rfp_no_recipient") expect(i.type === "rfp" && !i.recipientTeam).toBe(true);
        if (q.ruleId === "existing_claim_without_link") expect(d.claims.find((c) => c.id === q.ref)?.quote).toBe(q.quotes[0]);
      }
    }
    expect(lexicon).not.toContain("Ethereum");
  });

  it("gives counts for all 55 initiatives in alphabetical order", () => {
    const rows = openQuestionRows(d);
    expect(rows).toHaveLength(55);
    const titles = rows.map((r) => r.title);
    expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b, "en")));
    for (const r of rows) expect(r.total).toBe(OPEN_QUESTION_CATEGORIES.reduce((s, c) => s + r.counts[c], 0));
  });

  it("treats the conflict-of-interest initiative with the same rules (no special case)", async () => {
    const coi = d.initiatives.find((i) => isCoiOrganization(i.organizationId))!;
    const orgOf = d.organizations.find((o) => o.id === coi.organizationId)!;
    const lexicon = cohortPartyLexicon(d.milestones, d.organizations);
    const x = { milestones: d.milestones.filter((m) => m.initiativeId === coi.id).sort((a, b) => a.index - b.index), pledges: d.pledges.filter((p) => p.initiativeId === coi.id), claims: d.claims.filter((c) => c.initiativeId === coi.id), lexicon };
    const real = openQuestions({ initiative: coi, organization: orgOf, ...x });
    const renamed = openQuestions({ initiative: { ...coi, id: coi.id, organizationId: "org_neutral" }, organization: { name: orgOf.name, names: orgOf.names, website: orgOf.website }, ...x });
    expect(renamed).toEqual(real);
    expect(real.map((q) => q.question)).toEqual(openQuestionsFor(d, coi.id)!.map((q) => q.question));
    expect(await readRel("lib/intelligence/open-questions.ts")).not.toMatch(/proof[\s_-]*of[\s_-]*audits?|isCoiOrganization|COI_ORGANIZATION_ID/i);
  });
});

describe("workspace marks", () => {
  it("defaults to no marks and still parses workspaces saved before the field existed", () => {
    expect(EMPTY_WORKSPACE.openQuestions).toEqual({});
    const old = { version: 1, initiatives: [], notes: [], questions: [] };
    expect(WorkspaceSchema.parse(old).openQuestions).toEqual({});
    const imp = parseImport(JSON.stringify({ workspace: old }));
    expect(imp.ok && imp.workspace.openQuestions).toEqual({});
  });
  it("sets and clears a mark by question id, separate from the user-entered questions list", () => {
    const at = new Date("2026-11-27T10:00:00.000Z");
    const on = setOpenQuestionMark({}, "oq_1234567890abcdef", true, at);
    expect(on).toEqual({ oq_1234567890abcdef: { markedAt: "2026-11-27T10:00:00.000Z" } });
    expect(setOpenQuestionMark(on, "oq_1234567890abcdef", false)).toEqual({});
    const w = WorkspaceSchema.parse({ version: 1, openQuestions: on });
    expect(w.openQuestions).toEqual(on);
    expect(w.questions).toEqual([]);
    expect(WorkspaceSchema.safeParse({ version: 1, openQuestions: { x: { markedAt: 5 } } }).success).toBe(false);
  });
});

function readRel(rel: string) {
  return fs.readFile(path.join(ROOT, rel), "utf8");
}

describe("no outreach", () => {
  const FILES = ["lib/intelligence/open-questions.ts", "components/dossier/open-questions.tsx", "app/research/questions/page.tsx", "app/api/v1/open-questions/route.ts"];
  it("has no email, messaging or POST request code in this feature's files", async () => {
    for (const f of FILES) {
      const src = await readRel(f);
      expect(src, f).not.toMatch(/mailto:|nodemailer|sendMail|smtp|webhook|sendgrid|postmark|twilio|telegram|discord\.com\/api/i);
      expect(src, f).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon|method:\s*["']POST["']/i);
      expect(src, f).not.toMatch(/export\s+(const|async function|function)\s+(POST|PUT|PATCH|DELETE)\b/);
    }
  });
});
