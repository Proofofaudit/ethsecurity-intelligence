/** Team research foundation: curated schema, extractor, builder, coverage and audit check 14. */
import { beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadPublishedDataset } from "@/lib/db/file-store";
import type { Dataset } from "@/lib/domain/schemas";
import type { TeamResearchFile } from "@/lib/team/types";
import { CuratedTeamRecord, hasPrivateContact, parseCuratedTeam } from "@/lib/research-v2/schemas";
import { extractNamedLead, teamProfileLinks } from "@/research/normalize";
import { bucketCommits, githubTargets, monthWindow, sumMonthly, type TeamMachineResult } from "@/research/team";
import { buildTeamResearch, coverageOf, type PublishedTeamFile } from "@/research/team-build";
import { auditTeamResearchFile } from "@/research/audit";

const D = "2026-11-27";
const src = [{ label: "Public page", url: "https://example.org/a" }];
const base = (): CuratedTeamRecord => ({
  members: [
    {
      name: "Ada Example",
      role: "Founder",
      pseudonymous: false,
      handles: [{ platform: "github", handle: "ada-example", url: "https://github.com/ada-example", publishedBy: "proposal" }],
      pastWork: [{ label: "Example Labs", kind: "company", url: "https://example.org/labs", checkedOn: D }],
      sourceUrl: "https://example.org/team",
      checkedOn: D,
    },
  ],
  organization: { name: "Example Labs", summary: "Builds wallet tooling.", website: "https://example.org", previousFunding: [], otherProducts: [], sources: src, checkedOn: D },
  delivery: [{ grant: "Grant A", funder: "Funder", promised: "A tool", status: "Delivered", sources: src, checkedOn: D }],
  claims: [{ claim: "Open source", status: "Verified", sources: src, checkedOn: D, method: "Read the public repository" }],
  passes: { team: true, delivery: true, claims: true },
  notFound: [],
  researcher: "agent",
  checkedOn: D,
});

let d: Dataset;
beforeAll(async () => {
  d = await loadPublishedDataset();
});

describe("curated schema", () => {
  it("accepts a complete record", () => {
    expect(CuratedTeamRecord.safeParse(base()).success).toBe(true);
  });
  it("rejects emails and phone numbers", () => {
    const e = base();
    e.members[0]!.role = "Founder, ada@example.org";
    expect(() => parseCuratedTeam(e)).toThrow(/Email/);
    const p = base();
    p.organization!.summary = "Call +1 415 555 0132 for details";
    expect(() => parseCuratedTeam(p)).toThrow(/phone/);
    expect(hasPrivateContact("Checked 2026-11-27 at https://github.com/a/b/commit/1234567890")).toBe(false);
  });
  it("rejects missing sources, missing dates, non-http URLs and bad statuses", () => {
    const a = base();
    a.delivery[0]!.sources = [];
    expect(() => parseCuratedTeam(a)).toThrow(/source/);
    const b = base() as unknown as { claims: { checkedOn?: string }[] };
    delete b.claims[0]!.checkedOn;
    expect(() => parseCuratedTeam(b)).toThrow(/checkedOn/);
    const c = base();
    c.members[0]!.sourceUrl = "javascript:alert(1)";
    expect(() => parseCuratedTeam(c)).toThrow(/http/);
    const e = base() as unknown as { claims: { status: string }[]; delivery: { status: string }[] };
    e.claims[0]!.status = "Delivered";
    expect(() => parseCuratedTeam(e)).toThrow();
    const f = base() as unknown as { delivery: { status: string }[] };
    f.delivery[0]!.status = "Verified";
    expect(() => parseCuratedTeam(f)).toThrow();
  });
});

describe("named lead extractor", () => {
  const section =
    "I'm Jane Q Sample, founder of Example Co and a security researcher.\n\n**Track record:**\n\nhttps://audits.sherlock.xyz/watson/janesample\n\nhttps://github.com/janesample\nhttps://example.co";
  it("finds a named founder and only profile links from the section", () => {
    expect(extractNamedLead(section)).toEqual({ name: "Jane Q Sample", role: "Founder" });
    expect(teamProfileLinks(section)).toEqual(["https://audits.sherlock.xyz/watson/janesample", "https://github.com/janesample"]);
  });
  it("handles a 'Name, role' line and ignores text with no name", () => {
    expect(extractNamedLead("**Ada Example**, CTO\nhttps://github.com/ada")).toEqual({ name: "Ada Example", role: "CTO" });
    expect(extractNamedLead("We are a small team of engineers.")).toBeNull();
  });
  it("yields a named person for the Proof of Audits team section in the published dataset", () => {
    const ini = d.initiatives.find((i) => i.sections.some((s) => s.key === "team" && /Veerendra/.test(s.markdown)))!;
    const team = ini.sections.find((s) => s.key === "team")!.markdown;
    expect(extractNamedLead(team)?.name).toBe("M K Veerendra Vamshi");
    expect(teamProfileLinks(team).sort()).toEqual(["https://audits.sherlock.xyz/watson/veerendravamshi", "https://github.com/MKVEERENDRA"]);
    const person = d.people.find((p) => p.initiativeIds.includes(ini.id) && p.name.includes("Veerendra"));
    // Present only after the next pipeline run; the dataset is not rewritten here.
    if (person) expect(person.publicProfiles.every((u) => team.includes(u))).toBe(true);
  });
});

describe("machine collection helpers", () => {
  it("builds a 12 month UTC window and buckets commits", () => {
    const w = monthWindow(new Date("2026-11-27T00:00:00Z"));
    expect(w).toHaveLength(12);
    expect(w[0]).toBe("2025-12");
    expect(w[11]).toBe("2026-11");
    const b = bucketCommits(["2026-11-01T00:00:00Z", "2026-11-20T00:00:00Z", "2025-12-31T23:00:00Z", "2020-01-01T00:00:00Z"], w);
    expect(b[11]).toBe(2);
    expect(b[0]).toBe(1);
    expect(sumMonthly([b, b])[11]).toBe(4);
  });
  it("takes handles only from curated records and proposal profile links", () => {
    const t = githubTargets({ linkUrls: ["https://github.com/example-org/tool", "https://example.org"], profileUrls: ["https://github.com/janesample"], curated: base() });
    expect(t.people.map((p) => p.handle).sort()).toEqual(["ada-example", "janesample"]);
    expect(t.owners.map((o) => o.login).sort()).toEqual(["ada-example", "example-org", "janesample"]);
  });
});

function fixture() {
  const ini = d.initiatives[0]!;
  const w = monthWindow(new Date("2026-11-27T00:00:00Z"));
  const monthly = w.map((_, i) => i);
  const machine: TeamMachineResult = {
    initiativeId: ini.id,
    collectedAt: "2026-11-27T00:00:00Z",
    months: w,
    since: `${w[0]}-01T00:00:00Z`,
    method: "test",
    maxRequests: 10,
    requests: 1,
    truncated: false,
    owners: [],
    people: [{ handle: "ada-example", url: "https://github.com/ada-example", source: "curated", repos: [{ fullName: "ada-example/x", monthly, capped: false }], monthly }],
  };
  const rec = base();
  rec.members[0]!.handles[0]!.publishedBy = "website";
  const file = buildTeamResearch({ dataset: d, curatedBySlug: new Map([[ini.slug, rec]]), machineById: new Map([[ini.id, machine]]), now: new Date("2026-11-27T00:00:00Z"), questionsFor: () => ["Question? Source: https://example.org/a"] });
  return { ini, file, machine, w, monthly };
}

describe("builder", () => {
  it("produces an object that conforms to TeamResearchFile with 12 commit counts", () => {
    const { file, monthly } = fixture();
    const typed: TeamResearchFile = file; // compile-time check against lib/team/types.ts
    expect(typed.initiatives).toHaveLength(1);
    expect(typed.initiatives[0]!.members[0]!.githubMonthlyCommits).toEqual(monthly);
    expect(typed.initiatives[0]!.questions).toHaveLength(1);
  });
  it("leaves commits empty when no machine result exists and rejects unknown slugs", () => {
    const ini = d.initiatives[0]!;
    const f = buildTeamResearch({ dataset: d, curatedBySlug: new Map([[ini.slug, base()]]), machineById: new Map() });
    expect(f.initiatives[0]!.members[0]!.githubMonthlyCommits).toEqual([]);
    expect(() => buildTeamResearch({ dataset: d, curatedBySlug: new Map([["no-such-slug", base()]]), machineById: new Map() })).toThrow(/slug/);
  });
  it("computes coverage; complete needs all three passes", () => {
    const on = { team: true, delivery: true, claims: true };
    const c = coverageOf(55, [{ passes: on }, { passes: { ...on, claims: false } }, { passes: { team: false, delivery: true, claims: false } }]);
    expect(c).toEqual({ total: 55, teamDossier: 2, delivery: 3, claimChecks: 1, complete: 1 });
  });
});

describe("audit check 14", () => {
  const run = async (mutate?: (f: PublishedTeamFile) => void) => {
    const { ini, file, machine } = fixture();
    const dir = await mkdtemp(path.join(os.tmpdir(), "team-"));
    await writeFile(path.join(dir, `${ini.id}.json`), JSON.stringify(machine));
    const copy = structuredClone(file);
    mutate?.(copy);
    return auditTeamResearchFile(d, copy, dir);
  };
  it("passes on a consistent artifact", async () => {
    const r = await run();
    expect(r.failures).toEqual([]);
    expect(r.byCheck.team_source?.checked).toBeGreaterThan(0);
  });
  it("fails when a fact lacks a source URL or checked-on date", async () => {
    const a = await run((f) => {
      f.initiatives[0]!.deliveryTimeline[0]!.sources = [];
    });
    expect(a.failures.some((x) => x.startsWith("[team_source]"))).toBe(true);
    const b = await run((f) => {
      (f.initiatives[0]!.claimChecks[0] as { checkedOn: string }).checkedOn = "";
    });
    expect(b.failures.some((x) => x.startsWith("[team_source]"))).toBe(true);
  });
  it("fails on altered commit counts, bad statuses, contact details, a banned phrase and wrong coverage", async () => {
    expect((await run((f) => void f.initiatives[0]!.members[0]!.githubMonthlyCommits.splice(0, 1, 99))).failures.some((x) => x.startsWith("[team_commits_rederived]"))).toBe(true);
    expect((await run((f) => void ((f.initiatives[0]!.claimChecks[0] as { status: string }).status = "Great"))).failures.some((x) => x.startsWith("[team_status]"))).toBe(true);
    expect((await run((f) => void (f.initiatives[0]!.organization!.summary = "Write to a@b.org"))).failures.some((x) => x.startsWith("[team_private_contact]"))).toBe(true);
    expect((await run((f) => void (f.initiatives[0]!.organization!.summary = "You should vote for this one"))).failures.some((x) => x.startsWith("[team_language]"))).toBe(true);
    expect((await run((f) => void (f.meta.coverage.complete = 9))).failures.some((x) => x.startsWith("[team_coverage]"))).toBe(true);
  });
  it("fails when a proposal-published handle is not in the proposal", async () => {
    const r = await run((f) => {
      f.initiatives[0]!.members[0]!.handles[0]!.publishedBy = "proposal";
    });
    expect(r.failures.some((x) => x.startsWith("[team_handle_in_proposal]"))).toBe(true);
  });
});
