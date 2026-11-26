/**
 * Runs the real load path against a real MongoDB 8 (mongodb-memory-server) and reads the
 * dataset back through MongoStore. No production database is involved.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { AUX_COLLECTIONS, COLLECTIONS, MongoStore, closeMongoClients } from "@/lib/db/mongo-store";
import { INDEXES, VALIDATORS, loadDataset, setupDatabase } from "@/lib/db/setup";
import { loadPublishedDataset } from "@/lib/db/file-store";
import type { Correction, Dataset } from "@/lib/domain/schemas";

const run = promisify(execFile);
const DB = "esi_integration_test";

let server: MongoMemoryServer;
let client: MongoClient;
let db: Db;
let uri: string;
let published: Dataset;

const correction = (id: string, over: Partial<Correction> = {}): Correction => ({
  id,
  targetType: "claim",
  targetId: "clm_test",
  initiativeId: null,
  category: "incorrect",
  proposedCorrection: "The figure should be different.",
  evidenceUrl: "https://example.org/evidence",
  explanation: "Explanation that is long enough for validation.",
  attribution: null,
  contactCiphertext: null,
  state: "submitted",
  resolution: null,
  appliedChange: null,
  submittedAt: "2026-11-20T10:00:00.000Z",
  updatedAt: "2026-11-20T10:00:00.000Z",
  history: [{ at: "2026-11-20T10:00:00.000Z", state: "submitted", note: null }],
  submitterKey: "key-a",
  ...over,
});

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  uri = server.getUri();
  published = await loadPublishedDataset();
  // Exercise the real CLI exactly as `npm run db:load` does.
  await run("npx", ["tsx", "scripts/db-load.ts"], { env: { ...process.env, MONGODB_URI: uri, MONGODB_DB: DB }, cwd: process.cwd(), timeout: 110_000 });
  client = await MongoClient.connect(uri);
  db = client.db(DB);
});

afterAll(async () => {
  await client?.close();
  await closeMongoClients();
  await server?.stop();
});

describe("MongoStore against MongoDB 8 (mongodb-memory-server)", () => {
  it("runs on MongoDB 8", async () => {
    const info = await db.admin().serverInfo();
    expect(Number(String(info.version).split(".")[0])).toBeGreaterThanOrEqual(8);
  });

  it("reads back the published dataset unchanged", async () => {
    const store = new MongoStore(uri, DB);
    const d = await store.getDataset();
    expect(d.initiatives).toHaveLength(55);
    for (const key of Object.keys(COLLECTIONS) as (keyof typeof COLLECTIONS)[]) {
      expect(d[key].length, key).toBe(published[key].length);
    }
    expect(d.meta).toEqual(published.meta);
    const byId = new Map(published.claims.map((c) => [c.id, c]));
    for (const c of d.claims) expect(c).toEqual(byId.get(c.id));
    const iniById = new Map(published.initiatives.map((i) => [i.id, i]));
    for (const i of d.initiatives) expect(i).toEqual(iniById.get(i.id));
    // Deterministic alphabetical order.
    const titles = d.initiatives.map((i) => i.title);
    expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b)));
  });

  it("reports healthy with the loaded dataset version", async () => {
    const h = await new MongoStore(uri, DB).health();
    expect(h).toMatchObject({ backend: "mongodb", ok: true, degraded: false });
    expect(h.detail).toContain(published.meta.datasetVersion);
  });

  it("creates $jsonSchema validators and the declared indexes", async () => {
    const colls = await db.listCollections().toArray();
    const byName = new Map(colls.map((c) => [c.name, c]));
    for (const name of Object.keys(VALIDATORS)) {
      const c = byName.get(name) as { options?: { validator?: { $jsonSchema?: unknown }; validationLevel?: string; validationAction?: string } } | undefined;
      expect(c, name).toBeDefined();
      expect(c?.options?.validator?.$jsonSchema, name).toBeDefined();
      expect(c?.options?.validationLevel).toBe("strict");
      expect(c?.options?.validationAction).toBe("error");
    }
    for (const [name, ixs] of Object.entries(INDEXES)) {
      const existing = await db.collection(name).listIndexes().toArray();
      for (const ix of ixs) {
        const found = existing.find((e) => e.name === ix.name);
        expect(found, `${name}.${ix.name}`).toBeDefined();
        expect(Boolean(found?.unique), `${name}.${ix.name} unique`).toBe(Boolean(ix.unique));
      }
    }
  });

  it("rejects documents that violate a validator", async () => {
    await expect(db.collection(COLLECTIONS.pledges).insertOne({ id: "bad", initiativeId: "x", company: "y", amountCents: 1, status: "maybe" })).rejects.toThrow(/validation/i);
    await expect(
      db.collection(AUX_COLLECTIONS.corrections).insertOne({ ...correction("cor_bad"), evidenceUrl: "http://insecure.example" }),
    ).rejects.toThrow(/validation/i);
  });

  it("enforces unique indexes", async () => {
    const m = published.milestones[0]!;
    await expect(db.collection(COLLECTIONS.milestones).insertOne({ ...m, _id: "dup" as never, id: "dup" })).rejects.toThrow(/duplicate key/i);
  });

  it("loads idempotently: a second setup and load leaves counts unchanged", async () => {
    const before = Object.fromEntries(await Promise.all(Object.values(COLLECTIONS).map(async (c) => [c, await db.collection(c).countDocuments()] as const)));
    const auxBefore = await db.collection(AUX_COLLECTIONS.metrics).countDocuments();
    await setupDatabase(db);
    await loadDataset(db, published);
    for (const c of Object.values(COLLECTIONS)) expect(await db.collection(c).countDocuments(), c).toBe(before[c]);
    expect(await db.collection(AUX_COLLECTIONS.metrics).countDocuments()).toBe(auxBefore);
    expect(before[COLLECTIONS.initiatives]).toBe(55);
    const store = new MongoStore(uri, DB);
    expect((await store.getDataset()).initiatives).toHaveLength(55);
  });

  it("removes records that are no longer in the dataset", async () => {
    const reduced: Dataset = { ...published, changes: published.changes.slice(1) };
    await loadDataset(db, reduced);
    expect(await db.collection(COLLECTIONS.changes).countDocuments()).toBe(published.changes.length - 1);
    await loadDataset(db, published);
    expect(await db.collection(COLLECTIONS.changes).countDocuments()).toBe(published.changes.length);
  });

  it("stores, lists and optimistically updates corrections", async () => {
    const store = new MongoStore(uri, DB);
    await db.collection(AUX_COLLECTIONS.corrections).deleteMany({});
    const a = correction("cor_a", { initiativeId: published.initiatives[0]!.id });
    const b = correction("cor_b", { submittedAt: "2026-11-21T10:00:00.000Z", updatedAt: "2026-11-21T10:00:00.000Z", targetId: "clm_other", submitterKey: "key-b" });
    await store.createCorrection(a);
    await store.createCorrection(b);
    await expect(store.createCorrection(a)).rejects.toThrow(/duplicate key/i);

    expect(await store.getCorrection("cor_a")).toEqual(a);
    expect(await store.getCorrection("missing")).toBeNull();
    expect((await store.listCorrections()).map((c) => c.id)).toEqual(["cor_b", "cor_a"]);
    expect((await store.listCorrections({ targetId: "clm_other" })).map((c) => c.id)).toEqual(["cor_b"]);
    expect((await store.listCorrections({ initiativeId: a.initiativeId! })).map((c) => c.id)).toEqual(["cor_a"]);
    expect(await store.listCorrections({ states: ["accepted"] })).toEqual([]);

    const next: Correction = { ...a, state: "under_review", updatedAt: "2026-11-22T00:00:00.000Z", history: [...a.history, { at: "2026-11-22T00:00:00.000Z", state: "under_review", note: null }] };
    expect(await store.updateCorrection("cor_a", "submitted", next)).toBe(true);
    // Stale expected state: a concurrent moderator already moved it.
    expect(await store.updateCorrection("cor_a", "submitted", { ...next, state: "rejected" })).toBe(false);
    expect((await store.getCorrection("cor_a"))?.state).toBe("under_review");
    // Re-applying an identical document with the right expected state still counts as success.
    expect(await store.updateCorrection("cor_a", "under_review", next)).toBe(true);
    expect(await store.updateCorrection("missing", "submitted", next)).toBe(false);
    expect((await store.listCorrections({ states: ["under_review"] })).map((c) => c.id)).toEqual(["cor_a"]);

    expect(await store.countSubmissionsSince("key-a", "2026-11-19T00:00:00.000Z")).toBe(1);
    expect(await store.countSubmissionsSince("key-a", "2026-11-20T10:00:00.001Z")).toBe(0);
    expect(await store.countSubmissionsSince("key-b", "2026-11-01T00:00:00.000Z")).toBe(1);
    expect(await store.countSubmissionsSince("nobody", "2026-01-01T00:00:00.000Z")).toBe(0);
  });

  it("deletes private contacts after 30 days (fake clock) and never returns expired ones", async () => {
    const store = new MongoStore(uri, DB);
    const coll = db.collection(AUX_COLLECTIONS.corrections);
    await coll.deleteMany({});
    const submittedAt = "2026-11-20T10:00:00.000Z";
    const fresh = correction("cor_fresh", { submittedAt, contactCiphertext: "v1.a.b.c", contactExpiresAt: "2026-12-20T10:00:00.000Z" });
    const legacy = correction("cor_legacy", { submittedAt: "2026-10-01T00:00:00.000Z", contactCiphertext: "v1.d.e.f" });
    const none = correction("cor_none", { submittedAt });
    for (const c of [fresh, legacy, none]) await coll.insertOne({ _id: c.id as never, ...c });

    // Day 29: only the legacy record (no expiry field, submitted 50 days earlier) is purged.
    expect(await store.purgeExpiredContacts(new Date("2026-12-19T10:00:00.000Z"))).toBe(1);
    expect((await coll.findOne({ _id: "cor_legacy" as never }))?.contactCiphertext).toBeNull();
    expect((await coll.findOne({ _id: "cor_fresh" as never }))?.contactCiphertext).toBe("v1.a.b.c");
    // Day 30: the fresh record is purged in the database; the rest of the correction stays.
    expect(await store.purgeExpiredContacts(new Date("2026-12-20T10:00:00.000Z"))).toBe(1);
    const after = await coll.findOne({ _id: "cor_fresh" as never });
    expect(after).toMatchObject({ contactCiphertext: null, contactExpiresAt: null, proposedCorrection: fresh.proposedCorrection, state: "submitted" });
    expect(await store.purgeExpiredContacts(new Date("2027-01-01T00:00:00.000Z"))).toBe(0);
    expect(await coll.countDocuments()).toBe(3);

    // Reads filter in memory too, and an update built from a stale read cannot restore it.
    await coll.updateOne({ _id: "cor_fresh" as never }, { $set: { contactCiphertext: "v1.a.b.c", contactExpiresAt: "2026-01-01T00:00:00.000Z" } });
    expect((await store.getCorrection("cor_fresh"))?.contactCiphertext).toBeNull();
    expect((await store.listCorrections()).every((c) => c.contactCiphertext === null)).toBe(true);
    const stale = { ...fresh, contactExpiresAt: "2026-01-01T00:00:00.000Z" };
    expect(await store.updateCorrection("cor_fresh", "submitted", { ...stale, state: "under_review" })).toBe(true);
    expect((await coll.findOne({ _id: "cor_fresh" as never }))?.contactCiphertext).toBeNull();
  });

  it("refuses to serve when no dataset has been loaded", async () => {
    const store = new MongoStore(uri, "esi_empty_db");
    await expect(store.getDataset()).rejects.toThrow(/No dataset loaded/);
    const h = await store.health();
    expect(h.ok).toBe(false);
    expect(h.detail).toBe("Connected, but no dataset loaded");
  });

  it("reports unreachable servers as not ok", async () => {
    const h = await new MongoStore("mongodb://127.0.0.1:1/?serverSelectionTimeoutMS=500", DB).health();
    expect(h.ok).toBe(false);
    expect(h.detail).toMatch(/^MongoDB unreachable/);
  });
});
