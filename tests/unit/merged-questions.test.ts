/**
 * Item 20: merged Questions to check. Dedupe, one positive and one negative fixture per new rule,
 * wording, neutral language, deterministic order, equal output shape, audit recomputation.
 */
import { beforeAll, describe, expect, it } from "vitest";
import type { Dataset, Initiative } from "@/lib/domain/schemas";
import { loadPublishedDataset } from "@/lib/db/file-store";
import { findBannedPhrases } from "@/lib/neutralLanguage";
import { blindSpots, openQuestionsFor } from "@/lib/intelligence/service";
import { MERGED_CATEGORIES, QUESTION_COUNT_NOTE, mergedQuestions, questionCounts, questionLine, type MergedQuestion, type TeamResearchInput } from "@/lib/research-v2/questions";
import { auditTeamResearchFile } from "@/research/audit";

let d: Dataset;
beforeAll(async () => {
  d = await loadPublishedDataset();
});

const clone = (): Dataset => structuredClone(d);
const grant = (x: Dataset) => x.initiatives.find((i) => i.type === "grant")!;
const topics = (qs: MergedQuestion[]) => qs.map((q) => q.topic);
const team = (id: string, o: Partial<TeamResearchInput["initiatives"][number]> = {}): TeamResearchInput => ({ initiatives: [{ initiativeId: id, passes: { team: true, delivery: true, claims: true }, checkedOn: "2026-11-27", ...o }] });

describe("merge", () => {
  it("returns one entry for each of the initiatives", () => {
    const m = mergedQuestions(d);
    expect(Object.keys(m).sort()).toEqual(d.initiatives.map((i) => i.id).sort());
  });
  it("asks the same gap once when an open question and a blind spot cover one record", () => {
    const x = clone();
    const ini = grant(x);
    const claim = x.claims.find((c) => c.kind === "integration" && c.status === "applicant_reported" && c.origin !== "ai") ?? x.claims[0]!;
    Object.assign(claim, { initiativeId: ini.id, kind: "integration", status: "applicant_reported", origin: "rules", section: "why_grant", quote: "The tool is integrated and used in production.", sourceUrls: [ini.url], supportingEvidenceIds: [] });
    const oq = (openQuestionsFor(x, ini.id) ?? []).filter((q) => q.ruleId === "existing_claim_without_link" && q.ref === claim.id);
    const bs = blindSpots(x).filter((b) => b.initiativeId === ini.id && b.category === "unconfirmed_integration" && b.refs[0] === claim.id);
    expect(oq.length).toBe(1);
    expect(bs.length).toBe(1);
    const merged = mergedQuestions(x)[ini.id]!.filter((q) => q.topic === `integration-claim:${claim.id}`);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.origins).toEqual(["blind-spot", "open-question"]);
  });
  it("reports how many duplicates were merged, per initiative and for the cohort", () => {
    const c = questionCounts(d);
    expect(c.perInitiative).toHaveLength(d.initiatives.length);
    expect(c.cohort.before - c.cohort.after).toBe(c.cohort.duplicatesMerged);
    expect(c.cohort.duplicatesMerged).toBeGreaterThan(0);
    expect(c.perInitiative.every((r) => r.before - r.after === r.merged && r.merged >= 0)).toBe(true);
    expect(Object.values(c.cohort.byCategory).reduce((a, b) => a + b, 0)).toBe(c.cohort.after);
  });
});

describe("new rules", () => {
  it("team with a published handle and no public code history", () => {
    const x = clone();
    const ini = grant(x);
    x.repositories = x.repositories.filter((r) => !r.initiativeIds.includes(ini.id));
    const m = (commits: number[]) => team(ini.id, { members: [{ name: "A", handles: [{ platform: "github", handle: "a" }], githubMonthlyCommits: commits, sourceUrl: "https://example.org/team", checkedOn: "2026-11-27" }] });
    expect(topics(mergedQuestions(x, m([]))[ini.id]!)).toContain("team:no-code-history");
    expect(topics(mergedQuestions(x, m([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3]))[ini.id]!)).not.toContain("team:no-code-history");
    expect(topics(mergedQuestions(x, team(ini.id, { members: [{ name: "A", handles: [] }] }))[ini.id]!)).not.toContain("team:no-code-history");
  });
  it("goal more than 3 times the largest past grant, only when both amounts are known", () => {
    const x = clone();
    const ini = grant(x);
    x.previousGrants = [{ id: "pg1", initiativeId: ini.id, funder: "F", statement: "s", amountCents: 1_000_00, status: "applicant_reported", sourceUrls: ["https://example.org/pg"], provenance: x.previousGrants[0]?.provenance ?? ({} as never) }];
    x.round1 = { ...x.round1, initiativeMatches: { ...x.round1.initiativeMatches, [ini.id]: [] } };
    ini.funding.goalCents = 3_000_01;
    expect(topics(mergedQuestions(x)[ini.id]!)).toContain("goal-vs-past-grants");
    ini.funding.goalCents = 3_000_00;
    expect(topics(mergedQuestions(x)[ini.id]!)).not.toContain("goal-vs-past-grants");
    ini.funding.goalCents = 9_000_00;
    x.previousGrants[0]!.amountCents = null;
    expect(topics(mergedQuestions(x)[ini.id]!)).not.toContain("goal-vs-past-grants");
  });
  it("repository without a push for more than 6 months", () => {
    const x = clone();
    const ini = grant(x);
    const repo = { ...(x.repositories[0] as Dataset["repositories"][number]), initiativeIds: [ini.id], fullName: "Acme/Tool", url: "https://github.com/Acme/Tool", exists: true, archived: false };
    const asOf = Date.parse(x.meta.generatedAt);
    x.repositories = [{ ...repo, pushedAt: new Date(asOf - 200 * 86_400_000).toISOString() }];
    expect(topics(mergedQuestions(x)[ini.id]!)).toContain("repo-inactive:acme/tool");
    x.repositories = [{ ...repo, pushedAt: new Date(asOf - 100 * 86_400_000).toISOString() }];
    expect(topics(mergedQuestions(x)[ini.id]!)).not.toContain("repo-inactive:acme/tool");
  });
  it("claim contradicted by its source", () => {
    const ini = grant(d);
    const mk = (status: string) => team(ini.id, { claimChecks: [{ claim: "Open source", status, sources: [{ url: "https://example.org/c" }], checkedOn: "2026-11-27" }] });
    const q = mergedQuestions(d, mk("Contradicted by source"))[ini.id]!.find((x) => x.topic.startsWith("claim-contradicted:"));
    expect(q?.sourceUrls).toEqual(["https://example.org/c"]);
    expect(q?.origins).toEqual(["team-research"]);
    expect(mergedQuestions(d, mk("Verified"))[ini.id]!.some((x) => x.topic.startsWith("claim-contradicted:"))).toBe(false);
  });
  it("self-pledge against the organization named in the team research merges with the open question", () => {
    const x = clone();
    const ini = grant(x);
    const p = { ...x.pledges[0]!, initiativeId: ini.id, company: "Zyxwv Labs" };
    x.pledges = [p];
    const withTeam = mergedQuestions(x, team(ini.id, { organization: { name: "Zyxwv Labs" } }))[ini.id]!.filter((q) => q.topic === `self-pledge:${p.id}`);
    expect(withTeam).toHaveLength(1);
    expect(withTeam[0]!.origins).toContain("team-research");
    expect(mergedQuestions(x, team(ini.id, { organization: { name: "Other Org" } }))[ini.id]!.some((q) => q.topic === `self-pledge:${p.id}`)).toBe(false);
  });
});

describe("shape, wording, order", () => {
  let all: MergedQuestion[];
  beforeAll(() => {
    all = Object.values(mergedQuestions(d)).flat();
  });
  it("every question ends with ?, has an http source, a date, an origin and is neutral", () => {
    expect(all.length).toBeGreaterThan(0);
    for (const q of all) {
      expect(q.text.endsWith("?")).toBe(true);
      expect(q.sourceUrls.length).toBeGreaterThan(0);
      expect(q.sourceUrls.every((u) => /^https?:\/\//.test(u))).toBe(true);
      expect(q.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(q.origins.length).toBeGreaterThan(0);
      expect(MERGED_CATEGORIES).toContain(q.category);
      expect(findBannedPhrases(q.text)).toEqual([]);
      expect(Object.keys(q).sort()).toEqual(["category", "checkedOn", "id", "origins", "sourceUrls", "text", "topic"]);
    }
    expect(findBannedPhrases(QUESTION_COUNT_NOTE)).toEqual([]);
  });
  it("is deterministic, ordered by category then text, and topics are unique per initiative", () => {
    expect(JSON.stringify(mergedQuestions(d))).toBe(JSON.stringify(mergedQuestions(d)));
    for (const qs of Object.values(mergedQuestions(d))) {
      expect(new Set(topics(qs)).size).toBe(qs.length);
      for (let i = 1; i < qs.length; i++) {
        const a = qs[i - 1]!;
        const b = qs[i]!;
        const ca = MERGED_CATEGORIES.indexOf(a.category);
        const cb = MERGED_CATEGORIES.indexOf(b.category);
        expect(ca < cb || (ca === cb && a.text.localeCompare(b.text, "en") <= 0)).toBe(true);
      }
    }
  });
  it("question lines carry the first source link", () => {
    const q = all[0]!;
    expect(questionLine(q)).toBe(`${q.text} Source: ${q.sourceUrls[0]}`);
  });
});

describe("audit check 14 recomputes merged questions", () => {
  const ini = (): Initiative => grant(d);
  const file = () => {
    const i = ini();
    const t: TeamResearchInput = team(i.id);
    const qs = mergedQuestions(d, t)[i.id]!;
    return { generatedAt: "2026-11-27T00:00:00Z", meta: { coverage: { total: d.initiatives.length, teamDossier: 1, delivery: 1, claimChecks: 1, complete: 1 } }, initiatives: [{ initiativeId: i.id, members: [], organization: null, deliveryTimeline: [], claimChecks: [], questions: qs.map(questionLine), structuredQuestions: qs, passes: { team: true, delivery: true, claims: true }, notFound: ["none"] }] };
  };
  it("passes on a consistent artifact and fails when a question is changed", async () => {
    expect((await auditTeamResearchFile(d, file())).failures).toEqual([]);
    const bad = file();
    (bad.initiatives[0]!.structuredQuestions as MergedQuestion[]).pop();
    const r = await auditTeamResearchFile(d, bad);
    expect(r.failures.some((f) => f.includes("team_questions_rederived"))).toBe(true);
  });
});
