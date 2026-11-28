/**
 * Public /api/v1 route handlers, called directly with Request objects against the FileStore
 * (MONGODB_URI unset) and a temporary corrections file. No production database is involved.
 */
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Correction, Dataset } from "@/lib/domain/schemas";

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
type G = { __esiStore?: unknown; __esiMongoFailedAt?: number };
const g = globalThis as unknown as G;

const BASE = "http://localhost/api/v1";
const TOKEN = randomBytes(24).toString("hex");
const CONTACT = "private-reviewer@example.org";

let stateDir: string;
let d: Dataset;
let R: Record<string, Record<string, Handler>>;

const env = () => {
  vi.stubEnv("MONGODB_URI", "");
  vi.stubEnv("MODERATOR_TOKEN", TOKEN);
  vi.stubEnv("CONTACT_ENCRYPTION_KEY", randomKey);
  vi.stubEnv("RATE_LIMIT_SALT", "test-salt");
};
const randomKey = randomBytes(32).toString("base64");

/** Every public response body, to check that private data never leaks. */
const publicBodies: string[] = [];

async function call(route: string, method: string, url: string, opts: { params?: Record<string, string>; body?: unknown; headers?: Record<string, string>; rawBody?: string } = {}) {
  const handler = R[route]?.[method];
  if (!handler) throw new Error(`No ${method} handler for ${route}`);
  const headers: Record<string, string> = { ...opts.headers };
  let body: string | undefined = opts.rawBody;
  if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    headers["content-type"] = "application/json";
  }
  const res = await handler(new Request(`${BASE}${url}`, { method, headers, body }), { params: Promise.resolve(opts.params ?? {}) });
  const text = await res.text();
  if (!route.startsWith("moderation")) publicBodies.push(text);
  return { status: res.status, headers: res.headers, json: JSON.parse(text) as Record<string, any> };
}
const get = (route: string, url: string, params?: Record<string, string>) => call(route, "GET", url, { params });

function expectEnvelope(body: Record<string, any>) {
  expect(body.data).toBeDefined();
  const m = body.meta;
  expect(m.datasetVersion).toBe(d.meta.datasetVersion);
  expect(m.officialDataGeneratedAt).toBe(d.meta.officialGeneratedAt);
  expect(m.publishedAt).toBe(d.meta.generatedAt);
  expect(m.methodologyVersion).toBe(d.meta.methodologyVersion);
  expect(m.methodology).toMatch(/^https:\/\//);
  expect(m.sources.length).toBeGreaterThan(0);
  for (const s of m.sources) expect(s).toMatch(/^https:\/\//);
  expect(m.limitations.length).toBeGreaterThan(0);
}

function expectError(r: { status: number; json: Record<string, any> }, status: number, code: string) {
  expect(r.status).toBe(status);
  expect(r.json.error.code).toBe(code);
  expect(typeof r.json.error.message).toBe("string");
  expect(r.json.data).toBeUndefined();
}

beforeAll(async () => {
  stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "esi-api-"));
  // file-store resolves the corrections path at import time.
  process.env.ESI_LOCAL_STATE_DIR = stateDir;
  env();
  delete g.__esiStore;
  delete g.__esiMongoFailedAt;
  const mods = {
    initiatives: import("@/app/api/v1/initiatives/route"),
    initiative: import("@/app/api/v1/initiatives/[id]/route"),
    milestones: import("@/app/api/v1/initiatives/[id]/milestones/route"),
    funding: import("@/app/api/v1/initiatives/[id]/funding/route"),
    round1: import("@/app/api/v1/initiatives/[id]/round1/route"),
    evidenceCard: import("@/app/api/v1/initiatives/[id]/evidence-card/route"),
    similar: import("@/app/api/v1/initiatives/[id]/similar/route"),
    openQuestions: import("@/app/api/v1/open-questions/route"),
    organization: import("@/app/api/v1/organizations/[id]/route"),
    entity: import("@/app/api/v1/entities/[type]/[id]/route"),
    claim: import("@/app/api/v1/claims/[id]/route"),
    trace: import("@/app/api/v1/claims/[id]/trace/route"),
    evidence: import("@/app/api/v1/evidence/[id]/route"),
    compare: import("@/app/api/v1/compare/route"),
    coverage: import("@/app/api/v1/coverage/route"),
    blindSpots: import("@/app/api/v1/blind-spots/route"),
    fundingRelationships: import("@/app/api/v1/funding-relationships/route"),
    dependencies: import("@/app/api/v1/dependencies/route"),
    changes: import("@/app/api/v1/changes/route"),
    graph: import("@/app/api/v1/graph/route"),
    metrics: import("@/app/api/v1/metrics/route"),
    simulate: import("@/app/api/v1/simulate/route"),
    export: import("@/app/api/v1/export/route"),
    status: import("@/app/api/v1/status/route"),
    voteManifest: import("@/app/api/v1/vote-manifest/route"),
    corrections: import("@/app/api/v1/corrections/route"),
    "moderation/corrections": import("@/app/api/v1/moderation/corrections/route"),
  };
  R = {};
  for (const [k, p] of Object.entries(mods)) R[k] = (await p) as unknown as Record<string, Handler>;
  d = await (await import("@/lib/db/file-store")).loadPublishedDataset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  env();
  delete g.__esiStore;
  delete g.__esiMongoFailedAt;
});

describe("read endpoints", () => {
  it("lists all 55 initiatives alphabetically and filters against the real data", async () => {
    const all = await get("initiatives", "/initiatives");
    expect(all.status).toBe(200);
    expectEnvelope(all.json);
    expect(all.json.data.total).toBe(55);
    const titles = all.json.data.items.map((i: { title: string }) => i.title.toLowerCase());
    expect(titles).toEqual([...titles].sort((a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)));
    expect(all.json.data.sortNote).toMatch(/Alphabetical/);

    expect((await get("initiatives", "/initiatives?type=rfp")).json.data.total).toBe(d.initiatives.filter((i) => i.type === "rfp").length);
    expect((await get("initiatives", "/initiatives?type=grant")).json.data.total).toBe(d.initiatives.filter((i) => i.type === "grant").length);
    const withAdoption = new Set(d.milestones.filter((m) => m.adoption).map((m) => m.initiativeId)).size;
    expect((await get("initiatives", "/initiatives?adoption=has")).json.data.total).toBe(withAdoption);
    expect((await get("initiatives", "/initiatives?adoption=none")).json.data.total).toBe(55 - withAdoption);
    const done = new Set(d.milestones.filter((m) => m.done).map((m) => m.initiativeId)).size;
    expect((await get("initiatives", "/initiatives?hasCompletedMilestone=true")).json.data.total).toBe(done);
    const cat = d.initiatives[0]!.categories[0]!.slug;
    expect((await get("initiatives", `/initiatives?categories=${cat}`)).json.data.total).toBe(d.initiatives.filter((i) => i.categories.some((c) => c.slug === cat)).length);
  });

  it("paginates with limit, offset and cursor", async () => {
    const p1 = await get("initiatives", "/initiatives?limit=10");
    expect(p1.json.data.items).toHaveLength(10);
    expect(p1.json.data.nextCursor).toEqual(expect.any(String));
    const p2 = await get("initiatives", `/initiatives?limit=10&cursor=${p1.json.data.nextCursor}`);
    const p2o = await get("initiatives", "/initiatives?limit=10&offset=10");
    expect(p2.json.data.offset).toBe(10);
    expect(p2.json.data.items).toEqual(p2o.json.data.items);
    const last = await get("initiatives", "/initiatives?limit=10&offset=50");
    expect(last.json.data.items).toHaveLength(5);
    expect(last.json.data.nextCursor).toBeNull();
  });

  it("rejects bad parameters with 400", async () => {
    for (const q of ["limit=101", "limit=0", "limit=ten", "offset=-1", "bogus=1", "type=loan", "existingWork=maybe", "stages=not_a_stage", "limit=10&limit=20", "cursor=@@", "cursor=b2Zmc2V0&offset=1"]) {
      expectError(await get("initiatives", `/initiatives?${q}`), 400, "bad_request");
    }
    expectError(await get("entity", "/entities/wizard/x", { type: "wizard", id: "x" }), 400, "bad_request");
    expectError(await get("initiative", "/initiatives/x", { id: "bad id!" }), 400, "bad_request");
    expectError(await get("compare", `/compare?ids=${d.initiatives[0]!.id}`), 400, "bad_request");
    expectError(await get("compare", `/compare?ids=${d.initiatives.slice(0, 6).map((i) => i.id).join(",")}`), 400, "bad_request");
    expectError(await get("changes", "/changes?since=yesterday"), 400, "bad_request");
    expectError(await get("changes", "/changes?kinds=everything"), 400, "bad_request");
    expectError(await get("graph", `/graph?type=initiative&id=${d.initiatives[0]!.id}&depth=3`), 400, "bad_request");
    expectError(await get("graph", "/graph?type=initiative"), 400, "bad_request");
    expectError(await get("blindSpots", "/blind-spots?importance=critical"), 400, "bad_request");
  });

  it("returns 404 for unknown ids", async () => {
    expectError(await get("initiative", "/initiatives/nope", { id: "nope" }), 404, "not_found");
    expectError(await get("milestones", "/initiatives/nope/milestones", { id: "nope" }), 404, "not_found");
    expectError(await get("funding", "/initiatives/nope/funding", { id: "nope" }), 404, "not_found");
    expectError(await get("organization", "/organizations/org_nope", { id: "org_nope" }), 404, "not_found");
    expectError(await get("entity", "/entities/standard/ERC-0", { type: "standard", id: "ERC-0" }), 404, "not_found");
    expectError(await get("entity", "/entities/technology/x", { type: "technology", id: "x" }), 404, "not_found");
    expectError(await get("claim", "/claims/cl_nope", { id: "cl_nope" }), 404, "not_found");
    expectError(await get("trace", "/claims/cl_nope/trace", { id: "cl_nope" }), 404, "not_found");
    expectError(await get("evidence", "/evidence/ev_nope", { id: "ev_nope" }), 404, "not_found");
    expectError(await get("compare", `/compare?ids=${d.initiatives[0]!.id},nope`), 404, "not_found");
    expectError(await get("graph", "/graph?type=repository&id=repo_nope"), 404, "not_found");
    expectError(await get("metrics", "/metrics?initiative=nope"), 404, "not_found");
    expectError(await get("dependencies", "/dependencies?initiative=nope"), 404, "not_found");
    expectError(await get("changes", "/changes?initiativeIds=nope"), 404, "not_found");
    expectError(await get("export", "/export?ids=nope"), 404, "not_found");
    const sim = await call("simulate", "POST", "/simulate", { body: { initiativeIds: ["nope"] } });
    expect(sim.status).toBe(200);
    expect(sim.json.data.voteApp).toBe("https://initiatives.thedao.fund/vote");
  });

  it("wraps every success response with sources, freshness, methodology and limitations", async () => {
    const ini = d.initiatives.find((i) => i.organizationId)!;
    const claim = d.claims.find((c) => c.initiativeId === ini.id && c.evidenceIds.length)!;
    const ev = claim.evidenceIds[0]!;
    const standard = d.initiatives.flatMap((i) => i.standards)[0]!;
    const repo = d.repositories[0]!;
    const responses = await Promise.all([
      get("initiatives", "/initiatives"),
      get("initiative", `/initiatives/${ini.slug}`, { id: ini.slug }),
      get("milestones", `/initiatives/${ini.id}/milestones`, { id: ini.id }),
      get("funding", `/initiatives/${ini.id}/funding`, { id: ini.id }),
      get("organization", `/organizations/${ini.organizationId}`, { id: ini.organizationId! }),
      get("entity", `/entities/repository/${repo.id}`, { type: "repository", id: repo.id }),
      get("entity", `/entities/standard/${standard}`, { type: "standard", id: standard }),
      get("claim", `/claims/${claim.id}`, { id: claim.id }),
      get("trace", `/claims/${claim.id}/trace`, { id: claim.id }),
      get("evidence", `/evidence/${ev}`, { id: ev }),
      get("compare", `/compare?ids=${d.initiatives.slice(0, 5).map((i) => i.id).join(",")}`),
      get("coverage", "/coverage"),
      get("blindSpots", "/blind-spots"),
      get("fundingRelationships", "/funding-relationships"),
      get("dependencies", "/dependencies"),
      get("changes", "/changes"),
      get("graph", `/graph?type=initiative&id=${ini.slug}&includeMilestones=true`),
      get("metrics", "/metrics"),
      get("metrics", `/metrics?initiative=${ini.id}`),
      get("export", `/export?ids=${ini.id}`),
      get("status", "/status"),
      get("corrections", "/corrections"),
      call("simulate", "POST", "/simulate", { body: { initiativeIds: [ini.id], pledgeConversion: 0.5 } }),
    ]);
    for (const r of responses) {
      expect(r.status).toBe(200);
      expectEnvelope(r.json);
    }
    const [, dossier, milestones, funding, org, , std, claimRes, , evRes, cmp] = responses;
    expect(dossier!.json.data.initiative.id).toBe(ini.id);
    expect(dossier!.json.meta.sources).toContain(ini.url);
    expect(milestones!.json.data.total).toBe(d.milestones.filter((m) => m.initiativeId === ini.id).length);
    expect(funding!.json.data.officialUrl).toBe(ini.url);
    expect(funding!.json.data.voteApp).toBe("https://initiatives.thedao.fund/vote");
    expect(funding!.json.data.funding).toBeUndefined();
    expect(org!.json.data.organization.id).toBe(ini.organizationId);
    expect(std!.json.data.initiatives.length).toBeGreaterThan(0);
    expect(claimRes!.json.data.claim.id).toBe(claim.id);
    expect(evRes!.json.data.citedBy.map((c: { id: string }) => c.id)).toContain(claim.id);
    expect(cmp!.json.data.initiatives).toHaveLength(5);
  });

  it("points funding requests at TheDAO instead of copying figures", async () => {
    for (const ini of d.initiatives) {
      const r = await get("funding", `/initiatives/${ini.id}/funding`, { id: ini.id });
      expect(r.json.data.officialUrl).toBe(ini.url);
      expect(r.json.data.voteApp).toBe("https://initiatives.thedao.fund/vote");
      expect(JSON.stringify(r.json.data)).not.toMatch(/pledgedCents|theDaoAskCents|goalCents/);
    }
    const list = await get("initiatives", "/initiatives?limit=100");
    for (const row of list.json.data.items) {
      expect(row.theDaoAskCents).toBeUndefined();
      expect(row.goalCents).toBeUndefined();
      expect(row.url).toMatch(/^https:\/\//);
    }
  });

  it("serves Round 1 history per initiative and on organization profiles", async () => {
    const ini = d.initiatives.find((i) => (d.round1.initiativeMatches[i.id] ?? []).some((m) => m.status === "match"))!;
    const r = await get("round1", `/initiatives/${ini.slug}/round1`, { id: ini.slug });
    expect(r.status).toBe(200);
    expectEnvelope(r.json);
    expect(r.json.data.records.map((x: { projectId: string }) => x.projectId)).toEqual(d.round1.initiativeMatches[ini.id]!.map((m) => m.projectId));
    expect(r.json.data.sourceLabel).toBe("Independent evidence");
    expect(r.json.meta.sources).toContain("https://thedao.fund/transparency");
    const empty = d.initiatives.find((i) => (d.round1.initiativeMatches[i.id] ?? []).length === 0)!;
    const e = await get("round1", `/initiatives/${empty.id}/round1`, { id: empty.id });
    expect(e.json.data.records).toEqual([]);
    expect(e.json.data.emptyText).toBe("No Round 1 funding found in the sources checked.");
    expectError(await get("round1", "/initiatives/nope/round1", { id: "nope" }), 404, "not_found");
    const o = await get("organization", `/organizations/${ini.organizationId}`, { id: ini.organizationId! });
    expect(o.json.data.round1.records.length).toBe(d.round1.organizationMatches[ini.organizationId!]!.length);
  });

  it("serves the evidence card with a source URL and checked-on date on every item", async () => {
    const ini = d.initiatives[0]!;
    const r = await get("evidenceCard", `/initiatives/${ini.slug}/evidence-card`, { id: ini.slug });
    expect(r.status).toBe(200);
    expectEnvelope(r.json);
    expect(r.json.data.sections.map((s: { key: string }) => s.key)).toEqual(["shipped", "funding", "prior", "team", "audits", "not_found"]);
    for (const s of r.json.data.sections) for (const i of s.items) {
      expect(i.sourceUrl).toMatch(/^https?:\/\//);
      expect(Number.isFinite(Date.parse(i.checkedAt))).toBe(true);
    }
    const funding = r.json.data.sections.find((s: { key: string }) => s.key === "funding").items;
    expect(funding.find((i: { key: string }) => i.key === "pledged").amountCents).toBe(ini.funding.pledgedCents);
    expectError(await get("evidenceCard", "/initiatives/nope/evidence-card", { id: "nope" }), 404, "not_found");
  });

  it("serves similar initiatives with signals, quotes from both proposals and the hypothesis notice", async () => {
    const ini = d.initiatives.find((i) => i.shortTitle === "Echidna")!;
    const r = await get("similar", `/initiatives/${ini.slug}/similar`, { id: ini.slug });
    expect(r.status).toBe(200);
    expectEnvelope(r.json);
    expect(r.json.data.method).toBe("similar@1");
    expect(r.json.data.notice).toBe("This is a research hypothesis, not a finding");
    expect(r.json.data.items.length).toBeGreaterThan(0);
    for (const it of r.json.data.items) {
      expect(["Possible overlap", "Possible complement", "Same organization"]).toContain(it.label);
      expect(it.compareHref).toBe(`/initiatives?ids=${ini.slug},${it.other.slug}#compare`);
      const quoted = it.signals.filter((s: { quotes: unknown }) => s.quotes);
      expect(quoted.length).toBeGreaterThan(0);
      for (const s of quoted) expect(s.quotes.map((q: { initiativeId: string }) => q.initiativeId)).toEqual([ini.id, it.other.id]);
    }
    expectError(await get("similar", "/initiatives/nope/similar", { id: "nope" }), 404, "not_found");
  });

  it("serves open-question counts for all 55 initiatives alphabetically and the questions of one initiative", async () => {
    const all = await get("openQuestions", "/open-questions");
    expect(all.status).toBe(200);
    expectEnvelope(all.json);
    expect(all.json.data.method).toBe("open-questions@1");
    expect(all.json.data.notice).toBe("A question is not an accusation and not a finding that something is wrong.");
    const titles = all.json.data.rows.map((r: { title: string }) => r.title);
    expect(titles).toHaveLength(55);
    expect(titles).toEqual([...titles].sort((a: string, b: string) => a.localeCompare(b, "en")));
    const rfp = d.initiatives.find((i) => i.type === "rfp")!;
    const one = await get("openQuestions", `/open-questions?initiative=${rfp.slug}&categories=Delivery`);
    expect(one.status).toBe(200);
    expect(one.json.data.items.map((q: { question: string }) => q.question)).toContain("Who is expected to deliver?");
    for (const q of one.json.data.items) expect(q.category).toBe("Delivery");
    expectError(await get("openQuestions", "/open-questions?initiative=nope"), 404, "not_found");
  });

  it("serves the vote manifest from the published dataset with its alignment result", async () => {
    const r = await get("voteManifest", "/vote-manifest");
    expect(r.status).toBe(200);
    expectEnvelope(r.json);
    const v = r.json.data;
    expect(v.voteApp).toBe("https://initiatives.thedao.fund/vote");
    expect(v.countdown).toBeNull();
    expect(v.pool).toBeNull();
    expect(v.schedule).toBeNull();
  });

  it("serves the export as a downloadable attachment", async () => {
    const r = await get("export", "/export");
    expect(r.headers.get("content-disposition")).toMatch(/^attachment; filename="ethsecurity-evidence-bundle-[A-Za-z0-9._-]+\.json"$/);
    expect(r.json.data.format).toBe("ethsecurity-intelligence/evidence-bundle@1");
    expect(r.json.data.initiatives).toHaveLength(55);
    expect(r.json.data.claims).toHaveLength(d.claims.length);
  });

  it("reports only real ingestion validation results, freshness and research coverage", async () => {
    const r = await get("status", "/status");
    const s = r.json.data;
    expect(s.store).toMatchObject({ backend: "file", ok: true, degraded: false });
    expect(s.officialSync.snapshotId).toBe(d.meta.snapshotId);
    expect(s.officialSync.lastSuccessfulSyncAt).toBe(d.meta.ingestion.startedAt);
    expect(s.officialSync.validation).toEqual(d.meta.ingestion.validation);
    expect(s.officialSync.validationPassed).toBe(d.meta.ingestion.validation.every((v) => v.ok));
    expect(s.officialSync.validationPassed).toBe(true);
    expect(s.officialSync.validation.find((v: { check: string }) => v.check === "list_detail_consistency")).toMatchObject({ ok: true });
    expect(s.officialSync.failedRequestCount).toBe(d.meta.ingestion.failedRequests.length);
    expect(s.freshness.officialDataAgeHours).toEqual(expect.any(Number));
    expect(s.research.cohortSize).toBe(55);
    const complete = await get("initiatives", "/initiatives?researchComplete=true");
    expect(s.research.initiativesFullyResearched).toBe(complete.json.data.total);
    expect(s.research.initiativesMissingResearch).toHaveLength(55 - complete.json.data.total);
    const failed = d.researchJobs.filter((j) => j.state === "failed").length;
    expect(s.research.failedJobs).toHaveLength(failed);
    const jobs = Object.values(s.research.jobsByTask as Record<string, Record<string, number>>).reduce((n, t) => n + Object.values(t).reduce((a, b) => a + b, 0), 0);
    expect(jobs).toBe(d.researchJobs.length);
  });

  it("does not run funding what-if arithmetic", async () => {
    const r = await call("simulate", "POST", "/simulate", { body: { initiativeIds: [] } });
    expect(r.status).toBe(200);
    expect(r.json.data.fundingAndVoting).toMatch(/TheDAO/);
    expect(r.json.data.rows).toBeUndefined();
  });
});

// ───────────────────────────── Corrections ─────────────────────────────

const submission = (targetId: string, extra: Record<string, unknown> = {}) => ({
  targetType: "claim",
  targetId,
  category: "outdated",
  proposedCorrection: "The repository was archived after this snapshot was taken.",
  evidenceUrl: "https://github.com/example/repo",
  explanation: "The repository page shows an archived banner dated after the research run.",
  attribution: "A. Reviewer",
  elapsedMs: 20_000,
  ...extra,
});
const submit = (body: unknown, ip: string) => call("corrections", "POST", "/corrections", { body, headers: { "x-forwarded-for": ip } });
const mod = (method: "GET" | "PATCH", url: string, body?: unknown, token: string | null = TOKEN) =>
  call("moderation/corrections", method, url, { body, headers: token ? { authorization: `Bearer ${token}` } : {} });

describe("corrections workflow", () => {
  it("submit -> moderate -> accept propagates to the changelog, claim, dossier and change log", async () => {
    const claim = d.claims.find((c) => c.status === "applicant_reported")!;
    const ini = d.initiatives.find((i) => i.id === claim.initiativeId)!;
    const sub = await submit(submission(claim.id, { contact: CONTACT }), "203.0.113.10");
    expect(sub.status).toBe(201);
    expectEnvelope(sub.json);
    const id = sub.json.data.id as string;
    expect(sub.json.data.state).toBe("submitted");

    // Stored encrypted; the raw IP and plaintext contact are never stored.
    const stored = JSON.parse(await fs.readFile(path.join(stateDir, "corrections.json"), "utf8")) as Correction[];
    const rec = stored.find((c) => c.id === id)!;
    expect(rec.contactCiphertext).toMatch(/^v1\./);
    expect(Date.parse(rec.contactExpiresAt!) - Date.parse(rec.submittedAt)).toBe(30 * 24 * 60 * 60 * 1000);
    expect(JSON.stringify(stored)).not.toContain(CONTACT);
    expect(JSON.stringify(stored)).not.toContain("203.0.113.10");

    // Submissions never change research records and never appear publicly until moderated.
    expect((await get("claim", `/claims/${claim.id}`, { id: claim.id })).json.data.claim.status).toBe("applicant_reported");
    expect((await get("corrections", "/corrections")).json.data.items.map((c: { id: string }) => c.id)).not.toContain(id);

    const queue = await mod("GET", "/moderation/corrections?states=submitted");
    expect(queue.status).toBe(200);
    const item = queue.json.data.items.find((c: { id: string }) => c.id === id);
    expect(item).toMatchObject({ hasPrivateContact: true, allowedTransitions: ["under_review", "rejected"] });
    expect(JSON.stringify(queue.json)).not.toContain(rec.contactCiphertext!);
    expect(JSON.stringify(queue.json)).not.toContain(rec.submitterKey);

    // State machine: submitted -> accepted is not allowed.
    expectError(await mod("PATCH", "/moderation/corrections", { id, moderation: { to: "accepted", resolution: "x", appliedChange: { status: "outdated" } } }), 409, "conflict");
    expect((await mod("PATCH", "/moderation/corrections", { id, expectedState: "submitted", moderation: { to: "under_review", note: "internal: checking with researcher" } })).status).toBe(200);
    // Optimistic concurrency: the moderator saw an older state.
    expectError(await mod("PATCH", "/moderation/corrections", { id, expectedState: "submitted", moderation: { to: "disputed" } }), 409, "conflict");
    // Accepting requires public reasoning and an applied change.
    expectError(await mod("PATCH", "/moderation/corrections", { id, moderation: { to: "accepted", appliedChange: { status: "outdated" } } }), 400, "bad_request");
    expectError(await mod("PATCH", "/moderation/corrections", { id, moderation: { to: "accepted", resolution: "Confirmed." } }), 400, "bad_request");
    const accepted = await mod("PATCH", "/moderation/corrections", {
      id,
      expectedState: "under_review",
      moderation: { to: "accepted", resolution: "Confirmed on the repository page.", appliedChange: { status: "outdated", limitation: "Repository archived after the research run." } },
    });
    expect(accepted.status).toBe(200);
    expect(accepted.json.data.state).toBe("accepted");

    const log = await get("corrections", "/corrections");
    const entry = log.json.data.items.find((c: { id: string }) => c.id === id);
    expect(entry).toMatchObject({ state: "accepted", stateLabel: "Accepted", resolution: "Confirmed on the repository page.", proposedCorrection: expect.any(String), attribution: "A. Reviewer" });
    expect(entry.history.map((h: { state: string }) => h.state)).toEqual(["submitted", "under_review", "accepted"]);
    expect(JSON.stringify(log.json)).not.toContain("internal: checking with researcher");
    expect(log.json.data.notice).toBe("Help us improve the accuracy of this research. If information is incorrect, outdated or missing important context, please submit supporting evidence.");
    expect((await get("corrections", `/corrections?initiative=${ini.slug}`)).json.data.items.map((c: { id: string }) => c.id)).toContain(id);

    // Propagation through loadIntelligence to every read endpoint.
    const c2 = await get("claim", `/claims/${claim.id}`, { id: claim.id });
    expect(c2.json.data.claim.status).toBe("outdated");
    expect(c2.json.data.claim.limitations).toContain("Repository archived after the research run.");
    expect(c2.json.data.claim.history.at(-1).correctionId).toBe(id);
    expect(c2.json.data.corrections.map((c: { id: string }) => c.id)).toEqual([id]);
    const dossier = await get("initiative", `/initiatives/${ini.id}`, { id: ini.id });
    expect(dossier.json.data.claims.find((c: { id: string }) => c.id === claim.id).status).toBe("outdated");
    const exp = await get("export", `/export?ids=${ini.id}`);
    expect(exp.json.data.claims.find((c: { id: string }) => c.id === claim.id).status).toBe("outdated");
    const ch = await get("changes", `/changes?kinds=correction_published&initiativeIds=${ini.id}`);
    expect(ch.json.data.items).toHaveLength(1);
    expect(ch.json.data.items[0].summary).toBe("Correction accepted: Confirmed on the repository page.");
    const { loadIntelligence } = await import("@/lib/intelligence/load");
    expect((await loadIntelligence()).dataset.claims.find((c) => c.id === claim.id)?.status).toBe("outdated");
    // The published dataset file itself is untouched.
    const file = JSON.parse(await fs.readFile(path.join(process.cwd(), "data", "published", "dataset.json"), "utf8")) as Dataset;
    expect(file.claims.find((c) => c.id === claim.id)?.status).toBe("applicant_reported");

    // accepted -> resolved; resolved is final.
    expect((await mod("PATCH", "/moderation/corrections", { id, moderation: { to: "resolved" } })).status).toBe(200);
    expectError(await mod("PATCH", "/moderation/corrections", { id, moderation: { to: "under_review" } }), 409, "conflict");
    expect((await get("claim", `/claims/${claim.id}`, { id: claim.id })).json.data.claim.status).toBe("outdated");
  });

  it("publishes rejections with reasoning only, without republishing the submitted text", async () => {
    const ini = d.initiatives[1]!;
    const sub = await submit({ ...submission(ini.slug, { targetType: "initiative", proposedCorrection: "Unverified allegation text that must not be republished." }) }, "203.0.113.20");
    expect(sub.status).toBe(201);
    const id = sub.json.data.id as string;
    expectError(await mod("PATCH", "/moderation/corrections", { id, moderation: { to: "rejected" } }), 400, "bad_request");
    expect((await mod("PATCH", "/moderation/corrections", { id, moderation: { to: "rejected", resolution: "The linked page does not support the proposed change." } })).status).toBe(200);
    const entry = (await get("corrections", "/corrections")).json.data.items.find((c: { id: string }) => c.id === id);
    expect(entry).toMatchObject({ state: "rejected", stateLabel: "Rejected with reasoning", resolution: "The linked page does not support the proposed change.", proposedCorrection: null, evidenceUrl: null, attribution: null, targetId: ini.id, initiativeId: ini.id });
    expect(publicBodies.some((b) => b.includes("Unverified allegation text"))).toBe(false);
  });

  it("rejects invalid, spam and unknown-target submissions", async () => {
    const claim = d.claims[0]!;
    const ip = "203.0.113.30";
    expectError(await submit(submission(claim.id, { website: "http://spam" }), ip), 400, "bad_request");
    expectError(await submit(submission(claim.id, { elapsedMs: 1000 }), ip), 400, "bad_request");
    expectError(await submit(submission(claim.id, { evidenceUrl: "http://insecure.example" }), ip), 400, "bad_request");
    expectError(await submit(submission(claim.id, { explanation: "short" }), ip), 400, "bad_request");
    expectError(await submit(submission(claim.id, { state: "accepted" }), ip), 400, "bad_request");
    expectError(await submit(submission("cl_doesnotexist"), ip), 404, "not_found");
    vi.stubEnv("CONTACT_ENCRYPTION_KEY", "");
    expectError(await submit(submission(claim.id, { contact: CONTACT }), ip), 400, "bad_request");
    expect((await submit(submission(claim.id), ip)).status).toBe(201);
  });

  it("rate limits submissions per network with 429", async () => {
    const claim = d.claims[2]!;
    const ip = "198.51.100.77";
    for (let i = 0; i < 5; i++) expect((await submit(submission(claim.id), ip)).status).toBe(201);
    const limited = await submit(submission(claim.id), ip);
    expectError(limited, 429, "rate_limited");
    expect(limited.headers.get("retry-after")).toBe("3600");
    expect((await submit(submission(claim.id), "198.51.100.78")).status).toBe(201);
  });

  it("returns 503 for submissions while serving the read-only fallback", async () => {
    vi.stubEnv("MONGODB_URI", "mongodb://127.0.0.1:1/");
    g.__esiMongoFailedAt = Date.now();
    const r = await submit(submission(d.claims[0]!.id), "203.0.113.40");
    expectError(r, 503, "unavailable");
    // Reads keep working from the published file.
    expect((await get("initiatives", "/initiatives?limit=1")).status).toBe(200);
    expect((await get("status", "/status")).json.data.store).toMatchObject({ backend: "file", degraded: true });
  });

  it("requires MODERATOR_TOKEN for moderation and hides the endpoints when unset", async () => {
    expectError(await mod("GET", "/moderation/corrections", undefined, null), 401, "unauthorized");
    expectError(await mod("GET", "/moderation/corrections", undefined, "wrong-token"), 401, "unauthorized");
    expectError(await mod("PATCH", "/moderation/corrections", { id: "cor_x", moderation: { to: "under_review" } }, "wrong-token"), 401, "unauthorized");
    vi.stubEnv("MODERATOR_TOKEN", "");
    expectError(await mod("GET", "/moderation/corrections"), 404, "not_found");
    expectError(await mod("PATCH", "/moderation/corrections", { id: "cor_x", moderation: { to: "under_review" } }), 404, "not_found");
  });

  it("never exposes private contact details, ciphertext or submitter keys publicly", async () => {
    const stored = JSON.parse(await fs.readFile(path.join(stateDir, "corrections.json"), "utf8")) as Correction[];
    expect(stored.some((c) => c.contactCiphertext)).toBe(true);
    const all = publicBodies.join("\n");
    expect(all).not.toContain(CONTACT);
    for (const c of stored) {
      if (c.contactCiphertext) expect(all).not.toContain(c.contactCiphertext);
      expect(all).not.toContain(c.submitterKey);
    }
    expect(all).not.toContain("contactCiphertext");
    expect(all).not.toContain("contactExpiresAt");
    expect(all).not.toContain("submitterKey");
  });
});
