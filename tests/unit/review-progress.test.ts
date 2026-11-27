/**
 * Review progress (Item 13): export/import round trip, change detection against the change feed,
 * no network on edits, clearing every esi.* key, and the counter wording.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Revision } from "@/lib/domain/schemas";
import { revisionChanges } from "@/lib/intelligence/changes";
import { csvCell, workspaceToCsv, workspaceToJson, workspaceToMarkdown, type ExportContext } from "@/lib/workspace/export";
import { applyRevisits, backfillSeen, counterText, detectChanges, filterByState, recordVisit, seenFromEntry, snapshotFromFeed, type ProgressMark, type VisitFeedEntry } from "@/lib/workspace/progress";
import { exportWorkspace, parseImport, WorkspaceSchema } from "@/components/workspace/schema";

const rev = (n: number, over: Partial<Revision> = {}): Revision => ({
  id: `r${n}`, initiativeId: "a", n, createdAt: `2026-11-0${n}T00:00:00Z`, source: null, state: null, archived: false,
  title: "T", summary: "S", sections: { why: "Same" }, milestones: [{ name: "M1", amountCents: 100_00, adoption: false, done: false, criteria: ["c"] }], goalCents: null, fetched: true, ...over,
});

const entry = (id: string, over: Partial<VisitFeedEntry> = {}): VisitFeedEntry => ({ id, revision: 1, commentCount: null, changes: [], ...over });
const change = (id: string, kind: string, summary: string, at = "2026-11-05T00:00:00Z") => ({ id, at, kind, summary });

const ctx: ExportContext = {
  datasetVersion: "ds-test",
  dataAsOf: "2026-11-26T10:00:00Z",
  initiatives: [{ id: "a", slug: "alpha", label: "Alpha", url: "https://initiatives.thedao.fund/initiative/alpha" }, { id: "b", slug: "beta", label: "Beta", url: "https://initiatives.thedao.fund/initiative/beta" }],
  sourceUrls: ["https://initiatives.thedao.fund/api/initiatives/<slug>/comments"],
  openQuestions: [{ id: "oq1", initiativeId: "a", category: "Timeline", text: "When is the first milestone due?", sourceUrl: "https://initiatives.thedao.fund/initiative/alpha" }],
  evidenceLinks: [{ initiativeId: "a", section: "Shipped work", label: "Site", url: "https://alpha.example/", sourceName: "Official proposal", checkedAt: "2026-11-20T00:00:00Z" }],
};

function workspace() {
  return WorkspaceSchema.parse({
    version: 1,
    initiatives: [{ id: "a", addedAt: "2026-11-01T00:00:00Z", reviewedAt: "2026-11-02T00:00:00Z" }],
    notes: [{ id: "n1", initiativeId: "a", text: "=SUM(A1) needs a look, \"quoted\", comma", createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z" }],
    questions: [{ id: "q1", initiativeId: "b", text: "Who reviews?", createdAt: "2026-11-01T00:00:00Z" }],
    openQuestions: { oq1: { markedAt: "2026-11-03T00:00:00Z" } },
    progress: { a: { state: "reviewed", at: "2026-11-02T00:00:00Z", reason: null, seen: { revision: 1, commentCount: 2, changeIds: ["c1"] } }, b: { state: "reading", at: "2026-11-02T00:00:00Z" } },
    visit: { seen: snapshotFromFeed([entry("a")], "ds-test", new Date("2026-11-03T00:00:00Z")), baseline: null },
    futureField: { kept: true },
  });
}

describe("counter wording", () => {
  it("reads like a sentence with tabular numbers", () => {
    expect(counterText(12, 55)).toBe("You've reviewed 12 of 55.");
    expect(counterText(0, 55)).toBe("You've reviewed 0 of 55.");
  });
});

describe("export and import", () => {
  it("round-trips the whole workspace exactly through JSON and zod", () => {
    const w = workspace();
    const r = parseImport(workspaceToJson(w, ctx));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.workspace).toEqual(w);
  });

  it("still imports the older export format and a bare workspace", () => {
    const w = workspace();
    const old = parseImport(JSON.stringify(exportWorkspace(w)));
    expect(old.ok && old.workspace).toEqual(w);
    const legacy = parseImport(JSON.stringify({ version: 1, initiatives: [{ id: "x", addedAt: "t" }] }));
    expect(legacy.ok && legacy.workspace.progress).toEqual({});
  });

  it("rejects a file that is not a workspace", () => {
    expect(parseImport("{\"workspace\": {\"version\": 2}}").ok).toBe(false);
    expect(parseImport("nope").ok).toBe(false);
  });

  it("Markdown and CSV carry the timestamp, source URLs, open questions with marks and evidence links", () => {
    const w = workspace();
    for (const out of [workspaceToMarkdown(w, ctx), workspaceToCsv(w, ctx)]) {
      expect(out).toContain("2026-11-26T10:00:00Z");
      expect(out).toContain("ds-test");
      expect(out).toContain("https://initiatives.thedao.fund/api/initiatives/<slug>/comments");
      expect(out).toContain("oq1");
      expect(out).toContain("When is the first milestone due?");
      expect(out).toContain("https://alpha.example/");
      expect(out).not.toContain("\u2014");
    }
    expect(workspaceToMarkdown(w, ctx)).toContain("asked or resolved 2026-11-03");
    expect(workspaceToMarkdown(w, ctx)).toContain("Saved for later: yes");
    expect(workspaceToMarkdown(w, ctx)).toContain("State: Reading");
    expect(workspaceToCsv(w, ctx)).toContain("asked_or_resolved");
  });

  it("escapes CSV cells and guards against formulas", () => {
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-1")).toBe("'-1");
    expect(csvCell("@x")).toBe("'@x");
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
    expect(workspaceToCsv(workspace(), ctx)).toContain("\"'=SUM(A1) needs a look, \"\"quoted\"\", comma\"");
  });
});

describe("change detection", () => {
  const first = entry("a", { revision: 1, commentCount: 0, changes: [] });
  const snap = snapshotFromFeed([first, entry("b")], "ds-1");

  it("yields nothing on the first visit and when nothing changed", () => {
    expect(detectChanges(null, [entry("a", { revision: 5, commentCount: 9, changes: [change("x", "funding_changed", "Official raised $1 → $2")] })])).toEqual([]);
    expect(detectChanges(snap, [first, entry("b")])).toEqual([]);
  });

  it("names each kind of real change", () => {
    const cases: [string, string, string][] = [
      ["funding_changed", "Official raised $1 → $2", "Funding changed"],
      ["pledge_added", "New pledge: Acme $5,000 (pledged)", "New pledge"],
      ["donation_added", "Donation of $10", "New donation"],
      ["milestones_changed", "Milestones changed (2 → 3)", "Milestone edit"],
      ["text_changed", "Proposal content changed (revision 1 → 2)", "Text diff"],
    ];
    for (const [kind, summary, label] of cases) {
      const d = detectChanges(snap, [entry("a", { changes: [change(`c-${kind}`, kind, summary)] })]);
      expect(d).toHaveLength(1);
      expect(d[0]!.reason).toContain(label);
    }
  });

  it("detects revision changes produced by revisionChanges (milestone edit, text diff)", () => {
    const changes = revisionChanges([rev(1), rev(2, { sections: { why: "Different" }, milestones: [{ name: "M1", amountCents: 200_00, adoption: false, done: false, criteria: ["c"] }] })]);
    expect(changes).toHaveLength(1);
    const e = entry("a", { revision: 2, changes: changes.map((c) => change(c.id, c.kind, c.summary, c.detectedAt)) });
    const d = detectChanges(snap, [e]);
    expect(d[0]!.reason).toContain("Revision 2 changed sections (why); milestones");
    expect(d[0]!.reason).not.toContain("New revision 2");
  });

  it("names a new revision number when no change record exists yet", () => {
    expect(detectChanges(snap, [entry("a", { revision: 3 })])[0]!.reason).toBe("New revision 3");
  });

  it("counts new comments only when the count increases; empty comments are normal", () => {
    const s = snapshotFromFeed([entry("a", { commentCount: 2 })], "ds-1");
    expect(detectChanges(s, [entry("a", { commentCount: 5 })])[0]!.reason).toBe("3 new comments");
    expect(detectChanges(s, [entry("a", { commentCount: 3 })])[0]!.reason).toBe("1 new comment");
    expect(detectChanges(s, [entry("a", { commentCount: 2 })])).toEqual([]);
    expect(detectChanges(s, [entry("a", { commentCount: 1 })])).toEqual([]);
    expect(detectChanges(s, [entry("a", { commentCount: null })])).toEqual([]);
    expect(detectChanges(snapshotFromFeed([entry("a", { commentCount: null })], "d"), [entry("a", { commentCount: 4 })])).toEqual([]);
    expect(detectChanges(snapshotFromFeed([entry("a", { commentCount: 0 })], "d"), [entry("a", { commentCount: 0 })])).toEqual([]);
  });

  it("turns Reviewed into Revisit with a reason that names the change, and leaves unchanged marks alone", () => {
    const base = entry("a", { revision: 1, commentCount: 0 });
    const progress: Record<string, ProgressMark> = {
      a: { state: "reviewed", at: "2026-11-02T00:00:00Z", reason: null, seen: seenFromEntry(base) },
      b: { state: "reading", at: "2026-11-02T00:00:00Z", reason: null, seen: null },
    };
    expect(applyRevisits(progress, [base, entry("b")])).toBe(progress);
    const next = applyRevisits(progress, [entry("a", { changes: [change("c9", "funding_changed", "Official raised $1 → $2")] }), entry("b", { revision: 4 })], new Date("2026-11-10T00:00:00Z"));
    expect(next.a!.state).toBe("revisit");
    expect(next.a!.reason).toContain("Funding changed");
    expect(next.b).toBe(progress.b);
    expect(applyRevisits(next, [entry("a", { changes: [change("c9", "funding_changed", "Official raised $1 → $2")] })])).toBe(next);
  });

  it("filters by state and keeps the baseline for the whole visit", () => {
    const states = { a: "reviewed", b: "revisit" } as const;
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(filterByState(items, (id) => states[id as "a" | "b"] ?? "not_started", "revisit")).toEqual([{ id: "b" }]);
    expect(filterByState(items, () => "reading", "all")).toHaveLength(3);
    const s1 = snapshotFromFeed([entry("a")], "d", new Date("2026-11-01T00:00:00Z"));
    const s2 = snapshotFromFeed([entry("a", { revision: 2 })], "d", new Date("2026-11-01T00:10:00Z"));
    const s3 = snapshotFromFeed([entry("a", { revision: 2 })], "d", new Date("2026-11-01T02:00:00Z"));
    const v1 = recordVisit({ seen: null, baseline: null }, s1);
    expect(v1.baseline).toBeNull();
    const v2 = recordVisit(v1, s2);
    expect(v2.baseline).toBeNull();
    expect(recordVisit(v2, s3).baseline).toBe(s2);
  });
});

describe("store without network", () => {
  const data = new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  };
  beforeEach(() => {
    data.clear();
    vi.stubGlobal("window", { localStorage, addEventListener: () => undefined, removeEventListener: () => undefined });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("makes no network call for notes, states, saves or visit feeds", async () => {
    const store = await import("@/components/workspace/store");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"));
    const beacon = vi.fn();
    vi.stubGlobal("navigator", { sendBeacon: beacon });
    store.addNote("a", "first");
    const id = JSON.parse(data.get("esi.workspace")!).notes[0].id as string;
    store.updateNote(id, "second");
    store.toggleSaved("a");
    store.setProgressState("a", "reviewed", entry("a"));
    store.applyVisitFeed([entry("a", { changes: [change("c1", "funding_changed", "Official raised $1 → $2")] })], "ds-1");
    store.applyVisitFeed([entry("a", { changes: [change("c1", "funding_changed", "Official raised $1 → $2")] })], "ds-1");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(beacon).not.toHaveBeenCalled();
    const saved = JSON.parse(data.get("esi.workspace")!);
    expect(saved.progress.a.state).toBe("revisit");
    expect(saved.progress.a.reason).toContain("Funding changed");
    expect(saved.initiatives[0].reviewedAt).not.toBeNull();
  });

  it("setting Not started clears the state and reviewedAt together", async () => {
    const store = await import("@/components/workspace/store");
    store.toggleSaved("a");
    store.setProgressState("a", "reviewed");
    expect(JSON.parse(data.get("esi.workspace")!).initiatives[0].reviewedAt).not.toBeNull();
    store.setProgressState("a", "not_started");
    const w = JSON.parse(data.get("esi.workspace")!);
    expect(w.progress.a).toBeUndefined();
    expect(w.initiatives[0].reviewedAt).toBeNull();
  });

  it("Clear all my data removes every esi.* key and nothing else", async () => {
    const store = await import("@/components/workspace/store");
    store.addNote(null, "x");
    data.set("esi.lab.templates", "[]");
    data.set("esi.theme", "dark");
    data.set("other.key", "keep");
    store.clearAllMyData();
    expect([...data.keys()]).toEqual(["other.key"]);
  });

  it("Reviewed from the initiative page (with the feed entry) turns into Revisit after a change", async () => {
    const store = await import("@/components/workspace/store");
    store.setReviewed("a", true, entry("a", { commentCount: 1 }));
    store.applyVisitFeed([entry("a", { commentCount: 3 })], "ds-1");
    const saved = JSON.parse(data.get("esi.workspace")!);
    expect(saved.progress.a.state).toBe("revisit");
    expect(saved.progress.a.reason).toContain("2 new comments");
  });

  it("Reviewed without a stored record gets its baseline on the next visit and reports no change", async () => {
    const store = await import("@/components/workspace/store");
    store.setReviewed("a", true);
    store.applyVisitFeed([entry("a", { commentCount: 1 })], "ds-1");
    expect(JSON.parse(data.get("esi.workspace")!).progress.a.state).toBe("reviewed");
    store.applyVisitFeed([entry("a", { commentCount: 2 })], "ds-1");
    expect(JSON.parse(data.get("esi.workspace")!).progress.a.state).toBe("revisit");
  });

  it("re-reviewing without an entry does not reuse an older record", async () => {
    const store = await import("@/components/workspace/store");
    store.setReviewed("a", true, entry("a", { commentCount: 1 }));
    store.setReviewed("a", true);
    expect(JSON.parse(data.get("esi.workspace")!).progress.a.seen).toBeNull();
  });

  it("legacy reviewedAt-only marks get a baseline, then revisit on change", async () => {
    const store = await import("@/components/workspace/store");
    data.set("esi.workspace", JSON.stringify({ version: 1, initiatives: [{ id: "a", addedAt: "2026-11-01T00:00:00Z", reviewedAt: "2026-11-02T00:00:00Z" }] }));
    store.applyVisitFeed([entry("a", { revision: 1 })], "ds-1");
    expect(JSON.parse(data.get("esi.workspace")!).progress.a.state).toBe("reviewed");
    store.applyVisitFeed([entry("a", { revision: 2 })], "ds-1");
    expect(JSON.parse(data.get("esi.workspace")!).progress.a.reason).toContain("New revision 2");
  });

  it("Clear all my data resets the theme and notifies the templates store", async () => {
    const store = await import("@/components/workspace/store");
    const templates = await import("@/components/lab/templates");
    const attrs: Record<string, string> = { theme: "dark", themeChoice: "dark" };
    const events: string[] = [];
    vi.stubGlobal("document", { documentElement: { dataset: attrs } });
    vi.stubGlobal("CustomEvent", class { type: string; constructor(t: string) { this.type = t; } });
    vi.stubGlobal("window", { localStorage, matchMedia: () => ({ matches: false }), dispatchEvent: (e: { type: string }) => void events.push(e.type), addEventListener: () => undefined, removeEventListener: () => undefined });
    data.set("esi.theme", "dark");
    store.clearAllMyData();
    expect(attrs.themeChoice).toBe("system");
    expect(attrs.theme).toBe("light");
    expect(events).toContain("esi-theme");
    expect(data.has("esi.theme")).toBe(false);
    expect(typeof templates.resetTemplatesCache).toBe("function");
  });
});

describe("backfillSeen", () => {
  it("fills only Reviewed marks without a record and returns the same object otherwise", () => {
    const feed = [entry("a"), entry("b")];
    const progress = { a: { state: "reviewed", at: "t", reason: null, seen: null }, b: { state: "reading", at: "t", reason: null, seen: null } } as Record<string, ProgressMark>;
    const out = backfillSeen(progress, {}, feed);
    expect(out.a!.seen).not.toBeNull();
    expect(out.b!.seen).toBeNull();
    expect(backfillSeen(out, {}, feed)).toBe(out);
  });
});
