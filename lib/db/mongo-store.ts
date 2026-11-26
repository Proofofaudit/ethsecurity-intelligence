/**
 * MongoDB adapter (Atlas free tier M0 or any MongoDB ≥ 6). Collections are normalized: one
 * document per record, `_id` = canonical id. The published dataset is loaded by
 * `npm run db:load` after validation; the application only reads it.
 */
import { MongoClient, type Db, type Document } from "mongodb";
import { CONTACT_RETENTION_DAYS, purgeExpiredContact } from "@/lib/corrections";
import { Dataset as DatasetSchema, type Correction, type CorrectionState, type Dataset } from "@/lib/domain/schemas";
import { redactSecrets } from "./redact";
import type { IntelligenceStore, StoreHealth } from "./types";

/** Dataset array → collection name. */
export const COLLECTIONS = {
  initiatives: "initiatives",
  milestones: "milestones",
  pledges: "pledges",
  donations: "donations",
  organizations: "organizations",
  aliases: "organization_aliases",
  people: "people",
  repositories: "repositories",
  products: "products",
  integrations: "integrations",
  previousGrants: "previous_grants",
  securityProblems: "security_problems",
  claims: "claims",
  evidence: "evidence_sources",
  relationships: "relationships",
  revisions: "proposal_revisions",
  changes: "changes",
  researchJobs: "research_jobs",
} as const satisfies Record<Exclude<keyof Dataset, "meta">, string>;

export const AUX_COLLECTIONS = {
  meta: "dataset_meta",
  corrections: "corrections",
  snapshots: "official_snapshots",
  metrics: "metrics",
  methodology: "methodology_versions",
  researchResults: "research_results",
} as const;

/** One pooled client per connection string, shared across hot reloads. */
const globalForMongo = globalThis as unknown as { __esiMongo?: Map<string, Promise<MongoClient>> };

export function mongoClient(uri: string): Promise<MongoClient> {
  const clients = (globalForMongo.__esiMongo ??= new Map());
  let pending = clients.get(uri);
  if (!pending) {
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
      maxPoolSize: 5,
      appName: "ethsecurity-intelligence",
    });
    pending = client.connect().catch(async (err) => {
      clients.delete(uri);
      await client.close().catch(() => undefined);
      throw err;
    });
    clients.set(uri, pending);
  }
  return pending;
}

/** Close every pooled client (scripts and tests). */
export async function closeMongoClients(): Promise<void> {
  const clients = globalForMongo.__esiMongo;
  if (!clients) return;
  const all = [...clients.values()];
  clients.clear();
  await Promise.all(all.map((p) => p.then((c) => c.close()).catch(() => undefined)));
}

/** Remove the storage-only fields added by loadDataset (`_id`, `datasetVersion`) from a record. */
const strip = <T>(doc: Document): T => {
  const { _id, datasetVersion, ...rest } = doc;
  void _id;
  void datasetVersion;
  return rest as T;
};

/** The database purge runs at most this often; results are also filtered in memory on every read. */
const PURGE_INTERVAL_MS = 60_000;

export class MongoStore implements IntelligenceStore {
  readonly backend = "mongodb" as const;
  private cache: { at: number; version: string; dataset: Dataset } | null = null;
  private lastPurgeAt = 0;
  constructor(
    private readonly uri: string,
    private readonly dbName: string,
    private readonly ttlMs = 60_000,
  ) {}

  async db(): Promise<Db> {
    return (await mongoClient(this.uri)).db(this.dbName);
  }

  async getDataset(): Promise<Dataset> {
    if (this.cache && Date.now() - this.cache.at < this.ttlMs) return this.cache.dataset;
    const db = await this.db();
    const meta = await db.collection(AUX_COLLECTIONS.meta).findOne({ _id: "current" as never });
    if (!meta) throw new Error("No dataset loaded into MongoDB. Run `npm run db:load`.");
    if (this.cache && this.cache.version === meta.datasetVersion) {
      this.cache.at = Date.now();
      return this.cache.dataset;
    }
    const entries = await Promise.all(
      Object.entries(COLLECTIONS).map(async ([key, coll]) => [key, (await db.collection(coll).find({}).toArray()).map((d) => strip(d))] as const),
    );
    // meta.meta is the DatasetMeta object itself; its own datasetVersion field must be kept.
    const raw = { meta: meta.meta as Document, ...Object.fromEntries(entries) };
    const parsed = DatasetSchema.safeParse(raw);
    if (!parsed.success) throw new Error(`MongoDB dataset failed validation: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`);
    const d = parsed.data;
    // Restore deterministic ordering.
    d.initiatives.sort((a, b) => a.title.localeCompare(b.title));
    d.changes.sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
    this.cache = { at: Date.now(), version: meta.datasetVersion as string, dataset: d };
    return d;
  }

  async purgeExpiredContacts(now: Date = new Date()) {
    const cutoff = new Date(now.getTime() - CONTACT_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const r = await (await this.db()).collection(AUX_COLLECTIONS.corrections).updateMany(
      { contactCiphertext: { $type: "string" }, $or: [{ contactExpiresAt: { $lte: now.toISOString() } }, { contactExpiresAt: null, submittedAt: { $lte: cutoff } }] },
      { $set: { contactCiphertext: null, contactExpiresAt: null } },
    );
    this.lastPurgeAt = now.getTime();
    return r.modifiedCount;
  }

  private async autoPurge() {
    if (Date.now() - this.lastPurgeAt >= PURGE_INTERVAL_MS) await this.purgeExpiredContacts();
  }

  async listCorrections(filter: { states?: CorrectionState[]; targetId?: string; initiativeId?: string } = {}) {
    await this.autoPurge();
    const q: Document = {};
    if (filter.states) q.state = { $in: filter.states };
    if (filter.targetId) q.targetId = filter.targetId;
    if (filter.initiativeId) q.initiativeId = filter.initiativeId;
    const db = await this.db();
    return (await db.collection(AUX_COLLECTIONS.corrections).find(q).sort({ submittedAt: -1 }).limit(1000).toArray()).map((d) => purgeExpiredContact(strip<Correction>(d)));
  }

  async getCorrection(id: string) {
    await this.autoPurge();
    const doc = await (await this.db()).collection(AUX_COLLECTIONS.corrections).findOne({ _id: id as never });
    return doc ? purgeExpiredContact(strip<Correction>(doc)) : null;
  }

  async createCorrection(c: Correction) {
    await this.autoPurge();
    await (await this.db()).collection(AUX_COLLECTIONS.corrections).insertOne({ _id: c.id as never, ...c });
  }

  async updateCorrection(id: string, expectedState: CorrectionState, next: Correction) {
    await this.autoPurge();
    // `next` was built from an earlier read; never write back a contact that has since expired.
    const r = await (await this.db()).collection(AUX_COLLECTIONS.corrections).replaceOne({ _id: id as never, state: expectedState }, { ...purgeExpiredContact(next) });
    // matchedCount, not modifiedCount: an identical replacement is still a successful update.
    return r.matchedCount === 1;
  }

  async countSubmissionsSince(key: string, since: string) {
    await this.autoPurge();
    return (await this.db()).collection(AUX_COLLECTIONS.corrections).countDocuments({ submitterKey: key, submittedAt: { $gte: since } });
  }

  async health(): Promise<StoreHealth> {
    try {
      const db = await this.db();
      await db.command({ ping: 1 });
      const meta = await db.collection(AUX_COLLECTIONS.meta).findOne({ _id: "current" as never });
      return { backend: "mongodb", ok: !!meta, degraded: false, detail: meta ? `Connected; dataset ${meta.datasetVersion} loaded ${meta.loadedAt}` : "Connected, but no dataset loaded" };
    } catch (err) {
      return { backend: "mongodb", ok: false, degraded: false, detail: `MongoDB unreachable: ${redactSecrets(String(err instanceof Error ? err.message : err), this.uri).slice(0, 160)}` };
    }
  }
}
