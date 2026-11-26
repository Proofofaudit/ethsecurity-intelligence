import { beforeAll, describe, expect, it } from "vitest";
import { bookmarkAlerts, EMPTY_WORKSPACE, expirationAlerts, exportWorkspace, fingerprintFor, parseImport, WorkspaceSchema } from "@/components/workspace/schema";
import { loadPublishedDataset } from "@/lib/db/file-store";
import type { Dataset } from "@/lib/domain/schemas";
import { blindSpots, collaboration, compare, coverage, displayName, graphNeighborhood, pairDetails, simulatePortfolio } from "@/lib/intelligence/service";

let d: Dataset;
beforeAll(async () => {
  d = await loadPublishedDataset();
});

describe("collaboration", () => {
  it("reproduces every published hypothesis with its signals", () => {
    const items = collaboration(d);
    const rels = d.relationships.filter((r) => r.type === "potentially_overlaps" || r.type === "potentially_complements");
    expect(items).toHaveLength(rels.length);
    for (const c of items) {
      expect(c.signals).not.toBeNull();
      expect(c.relationship.reason.endsWith(c.reasons.join("; "))).toBe(true);
      expect(c.questions.length).toBeGreaterThan(0);
    }
  });

  it("analyzes every pair in a focus set, including pairs below the thresholds", () => {
    const ids = d.initiatives.slice(0, 4).map((i) => i.id);
    const pairs = pairDetails(d, ids);
    expect(pairs).toHaveLength(6);
    for (const p of pairs) {
      const rel = d.relationships.find((r) => r.type.startsWith("potentially_") && [r.from.id, r.to.id].sort().join() === [p.a, p.b].sort().join());
      expect(p.hypothesis?.id ?? null).toBe(rel?.id ?? null);
    }
  });
});

describe("displayName", () => {
  it("disambiguates initiatives that share a short title", () => {
    const names = d.initiatives.map((i) => displayName(d, i));
    const dupShort = d.initiatives.filter((i) => d.initiatives.some((x) => x.id !== i.id && x.shortTitle.toLowerCase() === i.shortTitle.toLowerCase()));
    for (const i of dupShort) expect(displayName(d, i)).not.toBe(i.shortTitle);
    expect(new Set(names).size).toBe(d.initiatives.length);
  });
});

describe("graph", () => {
  it("carries evidence and sources on every edge and keeps inferred edges marked", () => {
    const ini = d.initiatives[0]!;
    const g = graphNeighborhood(d, { type: "initiative", id: ini.id }, { includeMilestones: true });
    expect(g.edges.length).toBeGreaterThan(0);
    for (const e of g.edges) {
      expect(Array.isArray(e.evidenceIds)).toBe(true);
      expect(Array.isArray(e.sourceUrls)).toBe(true);
      if (e.type === "potentially_overlaps" || e.type === "potentially_complements" || e.type === "addresses") expect(e.confidence).toBe("inferred");
      if (e.type === "funds") expect(e.sourceUrls.length).toBeGreaterThan(0);
    }
    const noInferred = graphNeighborhood(d, { type: "initiative", id: ini.id }, { includeInferred: false });
    expect(noInferred.edges.every((e) => e.confidence !== "inferred")).toBe(true);
  });
});

describe("compare rows", () => {
  it("includes products, architecture, adoption commitments and beneficiaries with differs flags", () => {
    const c = compare(d, d.initiatives.slice(0, 3).map((i) => i.id));
    const keys = c.rows.map((r) => r.key);
    for (const k of ["products", "repoNames", "adoptionNames", "beneficiaries", "integrations"]) expect(keys).toContain(k);
    for (const r of c.rows) expect(r.differs).toBe(new Set(r.values).size > 1);
  });
});

describe("what-if assumptions", () => {
  it("baseline equals the official funding gap and assumptions list affected initiatives", () => {
    const ids = d.initiatives.map((i) => i.id);
    const base = simulatePortfolio(d, { initiativeIds: ids });
    for (const r of base.rows) {
      const ini = d.initiatives.find((i) => i.id === r.id)!;
      expect(r.securedCents).toBe(ini.funding.officialRaisedCents);
      expect(r.gapCents).toBe(Math.max(0, ini.funding.goalCents - ini.funding.officialRaisedCents));
    }
    expect(base.assumptions.every((a) => !a.active)).toBe(true);

    const withDep = d.relationships.find((r) => r.type === "depends_on" && r.to.type === "standard");
    const hyp = d.relationships.find((r) => r.type === "potentially_overlaps")!;
    const s = simulatePortfolio(d, {
      initiativeIds: [hyp.from.id, hyp.to.id, ...(withDep ? [withDep.from.id] : [])],
      unavailableStandards: withDep ? [withDep.to.id] : [],
      assumedCollaborations: [hyp.id],
      treatUnconfirmedIntegrationsAsUnavailable: true,
    });
    const collabAssumption = s.assumptions.find((a) => a.key === "collaboration")!;
    expect(collabAssumption.active).toBe(true);
    expect(collabAssumption.affected.sort()).toEqual([hyp.from.id, hyp.to.id].sort());
    if (withDep) expect(s.assumptions.find((a) => a.key === "standards")!.affected).toContain(withDep.from.id);
    // Qualitative assumptions never change dollar figures.
    const plain = simulatePortfolio(d, { initiativeIds: s.rows.map((r) => r.id) });
    expect(s.totals).toEqual(plain.totals);
  });
});

describe("coverage and blind spots", () => {
  it("coverage counts match addresses relationships", () => {
    for (const st of coverage(d).stages) expect(st.totalCount).toBe(d.relationships.filter((r) => r.type === "addresses" && r.to.id === st.stage).length);
  });
  it("blind spot questions are phrased as questions", () => {
    for (const b of blindSpots(d)) expect(b.question.trim().endsWith("?")).toBe(true);
  });
});

describe("workspace schema", () => {
  it("parses a version 1 workspace from the first release and fills new fields", () => {
    const old = { version: 1, initiatives: [{ id: "a", addedAt: "2026-11-01T00:00:00.000Z" }], searches: [] };
    const w = WorkspaceSchema.parse(old);
    expect(w.initiatives[0]).toMatchObject({ id: "a", reviewedAt: null, priority: null });
    expect(w.notes).toEqual([]);
    expect(w.assessments).toEqual([]);
  });

  it("round-trips through export and import, and rejects invalid files", () => {
    const w = WorkspaceSchema.parse({ ...EMPTY_WORKSPACE, notes: [{ id: "n1", initiativeId: null, text: "x", createdAt: "t", updatedAt: "t" }] });
    const back = parseImport(JSON.stringify(exportWorkspace(w)));
    expect(back.ok && back.workspace.notes[0]?.text).toBe("x");
    expect(parseImport("not json").ok).toBe(false);
    expect(parseImport(JSON.stringify({ version: 2 })).ok).toBe(false);
  });

  it("raises a decision expiration alert only for changes recorded after the assessment", () => {
    const ini = d.changes.find((c) => c.initiativeId)!.initiativeId!;
    const refs = d.changes.filter((c) => c.initiativeId === ini).map((c) => ({ id: c.id, at: c.detectedAt, kind: c.kind, summary: c.summary }));
    const w = WorkspaceSchema.parse({ ...EMPTY_WORKSPACE, assessments: [{ id: "a1", initiativeId: ini, text: "ok", savedAt: "t", fingerprint: fingerprintFor(d.meta.datasetVersion, refs) }] });
    expect(expirationAlerts(w, { [ini]: refs })).toEqual([]);
    const fresh = { id: "chg_new", at: "2099-01-01T00:00:00.000Z", kind: "funding_changed", summary: "Official raised changed" };
    const alerts = expirationAlerts(w, { [ini]: [...refs, fresh] });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.newChanges.map((c) => c.id)).toEqual(["chg_new"]);
  });

  it("flags bookmarks whose evidence status changed or disappeared", () => {
    const w = WorkspaceSchema.parse({
      ...EMPTY_WORKSPACE,
      bookmarks: [
        { id: "b1", claimId: "c1", initiativeId: "i", assertion: "x", status: "applicant_reported", savedAt: "t" },
        { id: "b2", claimId: "c2", initiativeId: "i", assertion: "y", status: "independently_verified", savedAt: "t" },
        { id: "b3", claimId: "c3", initiativeId: "i", assertion: "z", status: "future_target", savedAt: "t" },
      ],
    });
    const alerts = bookmarkAlerts(w, { c1: "applicant_reported", c2: "contradicted", c3: null });
    expect(alerts.map((a) => [a.claimId, a.after])).toEqual([
      ["c2", "contradicted"],
      ["c3", null],
    ]);
  });
});
