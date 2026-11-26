/**
 * Database failure recovery: getStore() serves the published file read-only while MongoDB is
 * unreachable, retries MongoDB after 30 seconds, and loadIntelligence() overlays only accepted
 * corrections. Uses mongodb-memory-server; no production database is involved.
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import type { Correction, Dataset } from "@/lib/domain/schemas";

type G = { __esiStore?: unknown; __esiMongoFailedAt?: number };
const g = globalThis as unknown as G;
const resetStore = () => {
  delete g.__esiStore;
  delete g.__esiMongoFailedAt;
};

let server: MongoMemoryServer;
let uri: string;
let published: Dataset;
let mod: {
  getStore: typeof import("@/lib/db").getStore;
  FileStore: typeof import("@/lib/db/file-store").FileStore;
  MongoStore: typeof import("@/lib/db/mongo-store").MongoStore;
  closeMongoClients: typeof import("@/lib/db/mongo-store").closeMongoClients;
  loadIntelligence: typeof import("@/lib/intelligence/load").loadIntelligence;
};

const DB = "esi_fallback_test";
const CLOSED = "mongodb://127.0.0.1:1/";

beforeAll(async () => {
  // file-store resolves the corrections path at import time.
  process.env.ESI_LOCAL_STATE_DIR = await fs.mkdtemp(path.join(os.tmpdir(), "esi-state-"));
  const [db, fileStore, mongoStore, load, setup] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/db/file-store"),
    import("@/lib/db/mongo-store"),
    import("@/lib/intelligence/load"),
    import("@/lib/db/setup"),
  ]);
  mod = { getStore: db.getStore, FileStore: fileStore.FileStore, MongoStore: mongoStore.MongoStore, closeMongoClients: mongoStore.closeMongoClients, loadIntelligence: load.loadIntelligence };
  published = await fileStore.loadPublishedDataset();
  server = await MongoMemoryServer.create();
  uri = server.getUri();
  const client = await MongoClient.connect(uri);
  await setup.setupDatabase(client.db(DB));
  await setup.loadDataset(client.db(DB), published);
  await client.close();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  resetStore();
});

afterAll(async () => {
  await mod?.closeMongoClients();
  await server?.stop();
});

describe("getStore failure recovery", () => {
  it("falls back to the published file read-only when MongoDB is unreachable", async () => {
    vi.stubEnv("MONGODB_URI", CLOSED);
    vi.stubEnv("MONGODB_DB", DB);
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const store = await mod.getStore();
    expect(store).toBeInstanceOf(mod.FileStore);
    expect(err).toHaveBeenCalledOnce();
    const h = await store.health();
    expect(h).toMatchObject({ backend: "file", ok: true, degraded: true });
    expect(h.detail).toMatch(/MongoDB unavailable/);
    expect((await store.getDataset()).initiatives).toHaveLength(55);
    await expect(store.createCorrection({} as Correction)).rejects.toThrow(/temporarily unavailable/);
    await expect(store.updateCorrection("x", "submitted", {} as Correction)).rejects.toThrow(/temporarily unavailable/);
  });

  it("does not retry MongoDB within 30 seconds, then reconnects after the window", async () => {
    vi.stubEnv("MONGODB_URI", CLOSED);
    vi.stubEnv("MONGODB_DB", DB);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const before = Date.now();
    expect(await mod.getStore()).toBeInstanceOf(mod.FileStore);
    expect(g.__esiMongoFailedAt).toBeGreaterThanOrEqual(before);

    // MongoDB comes back, but we are still inside the 30 s window: no connection attempt.
    vi.stubEnv("MONGODB_URI", uri);
    g.__esiMongoFailedAt = Date.now() - 29_000;
    const t0 = performance.now();
    const within = await mod.getStore();
    expect(within).toBeInstanceOf(mod.FileStore);
    expect((await within.health()).degraded).toBe(true);
    expect(performance.now() - t0).toBeLessThan(1000);

    // Window elapsed: MongoDB is retried and becomes primary again.
    g.__esiMongoFailedAt = Date.now() - 30_001;
    const after = await mod.getStore();
    expect(after).toBeInstanceOf(mod.MongoStore);
    expect(g.__esiMongoFailedAt).toBeUndefined();
    expect(await after.health()).toMatchObject({ backend: "mongodb", ok: true, degraded: false });
    expect((await after.getDataset()).initiatives).toHaveLength(55);
  });

  it("never exposes the connection string or credentials in degraded health or logs", async () => {
    const secretUri = "mongodb+srv://user:sup3r-secret@cluster0.example123.mongodb.net/db?serverSelectionTimeoutMS=500";
    const { redactSecrets } = await import("@/lib/db/redact");
    const msg = `getaddrinfo ENOTFOUND _mongodb._tcp.cluster0.example123.mongodb.net while connecting to ${secretUri}`;
    const out = redactSecrets(msg, secretUri);
    expect(out).not.toContain("sup3r-secret");
    expect(out).not.toContain("example123");
    expect(out).not.toContain("user:");
    expect(out).toContain("ENOTFOUND");
  });

  it("uses the file store with corrections enabled when MONGODB_URI is unset", async () => {
    vi.stubEnv("MONGODB_URI", "");
    const store = await mod.getStore();
    expect(store).toBeInstanceOf(mod.FileStore);
    expect(await store.health()).toMatchObject({ backend: "file", ok: true, degraded: false });
  });
});

describe("loadIntelligence", () => {
  const correction = (id: string, claimId: string, state: Correction["state"]): Correction => ({
    id,
    targetType: "claim",
    targetId: claimId,
    initiativeId: null,
    category: "outdated",
    proposedCorrection: "This statement is outdated.",
    evidenceUrl: "https://example.org/evidence",
    explanation: "The linked page shows the change made after publication.",
    attribution: null,
    contactCiphertext: null,
    state,
    resolution: "Moderator reasoning.",
    appliedChange: { status: "outdated", limitation: "Superseded by later evidence." },
    submittedAt: "2026-11-25T00:00:00.000Z",
    updatedAt: "2026-11-26T00:00:00.000Z",
    history: [{ at: "2026-11-25T00:00:00.000Z", state: "submitted", note: null }],
    submitterKey: "k",
  });

  it("overlays accepted corrections only", async () => {
    vi.stubEnv("MONGODB_URI", "");
    const [a, b, c, e] = published.claims.filter((x) => x.status !== "outdated");
    const store = await mod.getStore();
    await store.createCorrection(correction("cor_acc", a!.id, "accepted"));
    await store.createCorrection(correction("cor_sub", b!.id, "submitted"));
    await store.createCorrection(correction("cor_rej", c!.id, "rejected"));
    await store.createCorrection(correction("cor_rev", e!.id, "under_review"));
    const { dataset, health } = await mod.loadIntelligence();
    expect(health.backend).toBe("file");
    const get = (id: string) => dataset.claims.find((x) => x.id === id)!;
    expect(get(a!.id).status).toBe("outdated");
    expect(get(a!.id).limitations).toContain("Superseded by later evidence.");
    expect(get(b!.id)).toEqual(b);
    expect(get(c!.id)).toEqual(c);
    expect(get(e!.id)).toEqual(e);
    expect(dataset.changes.filter((x) => x.kind === "correction_published").map((x) => x.summary)).toEqual(["Correction accepted: Moderator reasoning."]);
  });
});
