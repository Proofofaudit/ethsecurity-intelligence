/**
 * Official API schemas reject malformed or incomplete responses, and ingestion never replaces
 * the last valid snapshot with invalid data. Network calls are mocked; the fixtures are the
 * raw official responses stored in data/official.
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "@/lib/official/client";
import { DetailResponseSchema, ListResponseSchema, type DetailResponse, type ListResponse } from "@/lib/official/schemas";

vi.mock("@/lib/official/client", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/official/client")>();
  return { ...real, fetchBallot: vi.fn(), fetchDetail: vi.fn(), fetchComments: vi.fn(), fetchRevision: vi.fn() };
});

const SRC = path.join(process.cwd(), "data", "official");
const readObj = async <T>(hash: string) => JSON.parse(await fs.readFile(path.join(SRC, "objects", `${hash}.json`), "utf8")) as T;

interface Manifest {
  snapshotId: string;
  status: string;
  ballotObject: string;
  initiatives: Record<string, { id: string; detail: string; stale: boolean }>;
}

let manifest: Manifest;
let ballot: ListResponse;
let details: Map<string, DetailResponse>;
const clone = <T>(x: T): T => structuredClone(x);

beforeAll(async () => {
  const snaps = (await fs.readdir(path.join(SRC, "snapshots"))).sort();
  const all = await Promise.all(snaps.map(async (f) => JSON.parse(await fs.readFile(path.join(SRC, "snapshots", f), "utf8")) as Manifest));
  manifest = all.filter((m) => m.status === "valid").at(-1)!;
  ballot = ListResponseSchema.parse(await readObj(manifest.ballotObject));
  details = new Map(await Promise.all(Object.entries(manifest.initiatives).map(async ([slug, e]) => [slug, await readObj<DetailResponse>(e.detail)] as const)));
});

describe("official response schemas", () => {
  it("accept the stored official responses", () => {
    expect(ballot.initiatives).toHaveLength(55);
    for (const d of details.values()) expect(DetailResponseSchema.safeParse(d).success).toBe(true);
  });

  it.each<[string, (b: Record<string, unknown> & { initiatives: Record<string, unknown>[] }) => void]>([
    ["missing generatedAt", (b) => delete b.generatedAt],
    ["unknown schema version", (b) => (b.schemaVersion = 3)],
    ["invalid date", (b) => (b.generatedAt = "yesterday")],
    ["string amount", (b) => (b.initiatives[0]!.goalUsd = "100000")],
    ["negative raised", (b) => (b.initiatives[0]!.raisedUsd = -1)],
    ["percentage above 100", (b) => (b.initiatives[0]!.pctFunded = 101)],
    ["unknown type", (b) => (b.initiatives[0]!.type = "bounty")],
    ["missing milestones", (b) => delete b.initiatives[0]!.milestones],
    ["unknown pledge status", (b) => (b.initiatives[0]!.pledges = [{ company: "X", amountUsd: 1, status: "maybe" }])],
    ["non-URL link", (b) => (b.initiatives[0]!.url = "not a url")],
    ["initiatives not an array", (b) => (b.initiatives = {} as never)],
  ])("reject a ballot list with %s", (_label, mutate) => {
    const b = clone(ballot) as unknown as Record<string, unknown> & { initiatives: Record<string, unknown>[] };
    mutate(b);
    expect(ListResponseSchema.safeParse(b).success).toBe(false);
  });

  it.each<[string, (d: Record<string, Record<string, unknown>> & { pledges: Record<string, unknown>[] }) => void]>([
    ["missing summary", (d) => delete (d as Record<string, unknown>).summary],
    ["missing onBallot", (d) => delete (d as Record<string, unknown>).onBallot],
    ["short id", (d) => (d.initiative!.id = "abc")],
    ["negative goal", (d) => (d.initiative!.goalUsd = -5)],
    ["string total", (d) => (d.summary!.total = "10")],
    ["bad pledge status", (d) => (d.pledges = [{ id: "p", company: "X", amountUsd: 1, status: "maybe" }])],
    ["negative milestone amount", (d) => ((d.initiative!.milestones as Record<string, unknown>[])[0]!.amount = -1)],
  ])("reject a detail response with %s", (_label, mutate) => {
    const d = clone(details.values().next().value!) as unknown as Record<string, Record<string, unknown>> & { pledges: Record<string, unknown>[] };
    mutate(d);
    expect(DetailResponseSchema.safeParse(d).success).toBe(false);
  });
});

describe("ingestion safety (network mocked)", () => {
  let dataDir: string;
  let store: typeof import("@/research/store");
  let ingest: typeof import("@/research/ingest").ingest;
  const quiet = { log: () => undefined, delayMs: 0 };

  beforeAll(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "esi-ingest-"));
    await fs.cp(SRC, path.join(dataDir, "official"), { recursive: true });
    await fs.copyFile(path.join(process.cwd(), "data", "cohort.json"), path.join(dataDir, "cohort.json"));
    // research/store resolves DATA_DIR at import time, so it is imported only after this.
    process.env.ESI_DATA_DIR = dataDir;
    store = await import("@/research/store");
    ingest = (await import("@/research/ingest")).ingest;
    expect(store.DATA_DIR).toBe(path.resolve(dataDir));
  });

  beforeEach(() => {
    vi.mocked(client.fetchComments).mockRejectedValue(new Error("comments offline"));
    vi.mocked(client.fetchRevision).mockRejectedValue(new Error("revisions offline"));
    vi.mocked(client.fetchDetail).mockImplementation(async (slug: string) => {
      const d = details.get(slug);
      if (!d) throw new Error(`unknown ${slug}`);
      return clone(d);
    });
  });

  it("writes nothing when the ballot list fails schema validation", async () => {
    const before = await store.listSnapshots();
    vi.mocked(client.fetchBallot).mockRejectedValue(new client.ValidationFailure("Response failed schema validation", "https://example.invalid", ["count: expected number"]));
    await expect(ingest(quiet)).rejects.toThrow(/schema validation/);
    expect(await store.listSnapshots()).toEqual(before);
    expect((await store.latestValidSnapshot())?.snapshotId).toBe(manifest.snapshotId);
  });

  it("marks a ballot with duplicate identifiers invalid and keeps the previous valid snapshot", async () => {
    const dup = clone(ballot);
    dup.initiatives.push(clone(dup.initiatives[0]!));
    dup.count = dup.initiatives.length;
    vi.mocked(client.fetchBallot).mockResolvedValue({ data: dup, raw: JSON.stringify(dup) });
    const m = await ingest(quiet);
    expect(m.status).toBe("invalid");
    expect(m.validation.find((v) => v.check === "unique_slugs")?.ok).toBe(false);
    expect((await store.latestValidSnapshot())?.snapshotId).toBe(manifest.snapshotId);
  });

  it("marks a ballot whose count disagrees with its array invalid", async () => {
    const bad = clone(ballot);
    bad.count = 54;
    vi.mocked(client.fetchBallot).mockResolvedValue({ data: bad, raw: JSON.stringify(bad) });
    const m = await ingest(quiet);
    expect(m.status).toBe("invalid");
    expect((await store.latestValidSnapshot())?.snapshotId).toBe(manifest.snapshotId);
  });

  it("reuses the last known-good detail objects when every detail request fails", async () => {
    vi.mocked(client.fetchBallot).mockResolvedValue({ data: clone(ballot), raw: "" });
    vi.mocked(client.fetchDetail).mockRejectedValue(new client.ValidationFailure("Response failed schema validation", "https://example.invalid", ["summary: required"]));
    const m = await ingest(quiet);
    expect(Object.keys(m.initiatives)).toHaveLength(55);
    for (const [slug, e] of Object.entries(m.initiatives)) {
      expect(e.stale, slug).toBe(true);
      expect(e.detail, slug).toBe(manifest.initiatives[slug]?.detail);
    }
    expect(m.failedRequests.length).toBeGreaterThanOrEqual(55);
  });
});
