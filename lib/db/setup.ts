/**
 * Collection creation, $jsonSchema validators, indexes and dataset loading for MongoDB.
 * Works on Atlas free tier (M0): uses only standard CRUD, indexes and collMod.
 */
import type { Db, Document } from "mongodb";
import { METRICS, METHODOLOGY_VERSION } from "@/lib/metrics/registry";
import { cohortMetrics, initiativeMetrics } from "@/lib/metrics/compute";
import type { Dataset } from "@/lib/domain/schemas";
import { AUX_COLLECTIONS, COLLECTIONS } from "./mongo-store";

type Props = Record<string, Document>;
const str = { bsonType: "string" };
const strNull = { bsonType: ["string", "null"] };
const int = { bsonType: ["int", "long", "double"] };
const bool = { bsonType: "bool" };
const arr = { bsonType: "array" };
const obj = { bsonType: "object" };

const schema = (required: string[], properties: Props): Document => ({ $jsonSchema: { bsonType: "object", required, properties } });

const STATUS = {
  enum: [
    "independently_verified",
    "officially_reported",
    "applicant_reported",
    "partially_supported",
    "not_independently_verified",
    "contradicted",
    "disputed",
    "future_target",
    "outdated",
    "not_applicable",
  ],
};

export const VALIDATORS: Record<string, Document> = {
  [COLLECTIONS.initiatives]: schema(["id", "slug", "title", "type", "funding", "provenance", "contentHash"], {
    id: str,
    slug: str,
    title: str,
    type: { enum: ["grant", "rfp"] },
    onBallot: bool,
    cohortMember: bool,
    funding: schema(["goalCents", "officialRaisedCents", "pledgedCents", "donatedCents"], { goalCents: int, officialRaisedCents: int, pledgedCents: int, donatedCents: int }).$jsonSchema,
    provenance: obj,
  }),
  [COLLECTIONS.milestones]: schema(["id", "initiativeId", "index", "name", "amountCents", "adoption", "done"], { id: str, initiativeId: str, index: int, name: str, amountCents: int, adoption: bool, done: bool }),
  [COLLECTIONS.pledges]: schema(["id", "initiativeId", "company", "amountCents", "status"], { id: str, initiativeId: str, company: str, amountCents: int, status: { enum: ["pledged", "received"] } }),
  [COLLECTIONS.donations]: schema(["id", "initiativeId", "txHash", "status"], { id: str, initiativeId: str, txHash: { bsonType: "string", pattern: "^0x[0-9a-fA-F]{64}$" }, status: str }),
  [COLLECTIONS.organizations]: schema(["id", "name", "kind", "anonymous", "provenance"], { id: str, name: str, kind: { enum: ["recipient", "backer", "both", "related"] }, anonymous: bool }),
  [COLLECTIONS.aliases]: schema(["id", "alias", "organizationId", "resolution", "reason"], {
    id: str,
    alias: str,
    organizationId: str,
    resolution: { enum: ["exact_normalized", "same_official_domain", "curated_with_evidence", "candidate_unconfirmed", "anonymous_not_merged"] },
    reason: str,
  }),
  [COLLECTIONS.people]: schema(["id", "name", "initiativeIds", "provenance"], { id: str, name: str, initiativeIds: arr }),
  [COLLECTIONS.repositories]: schema(["id", "fullName", "url", "exists", "checkedAt"], { id: str, fullName: str, url: str, exists: bool, checkedAt: str }),
  [COLLECTIONS.products]: schema(["id", "url", "initiativeIds"], { id: str, url: str, initiativeIds: arr }),
  [COLLECTIONS.integrations]: schema(["id", "initiativeId", "statement", "status"], { id: str, initiativeId: str, statement: str, status: STATUS }),
  [COLLECTIONS.previousGrants]: schema(["id", "initiativeId", "statement", "status"], { id: str, initiativeId: str, statement: str, status: STATUS }),
  [COLLECTIONS.securityProblems]: schema(["id", "label", "terms"], { id: str, label: str, terms: arr }),
  [COLLECTIONS.claims]: schema(["id", "initiativeId", "kind", "assertion", "origin", "status", "verificationMethod", "history"], {
    id: str,
    initiativeId: str,
    kind: str,
    assertion: str,
    origin: { enum: ["official", "external", "applicant", "derived", "ai", "curated"] },
    status: STATUS,
    verificationMethod: str,
    history: arr,
  }),
  [COLLECTIONS.evidence]: schema(["id", "kind", "url", "observedAt", "provenance"], { id: str, kind: str, url: str, observedAt: str, ok: bool }),
  [COLLECTIONS.relationships]: schema(["id", "from", "to", "type", "confidence"], { id: str, from: obj, to: obj, type: str, confidence: { enum: ["confirmed", "stated", "inferred"] } }),
  [COLLECTIONS.revisions]: schema(["id", "initiativeId", "n"], { id: str, initiativeId: str, n: int }),
  [COLLECTIONS.changes]: schema(["id", "kind", "summary", "detectedAt", "source"], { id: str, kind: str, summary: str, detectedAt: str, source: str }),
  [COLLECTIONS.researchJobs]: schema(["id", "initiativeId", "task", "state", "attempts"], { id: str, initiativeId: str, task: str, state: { enum: ["pending", "running", "succeeded", "failed", "skipped"] }, attempts: int }),
  [AUX_COLLECTIONS.corrections]: schema(["id", "targetType", "targetId", "category", "proposedCorrection", "evidenceUrl", "explanation", "state", "submittedAt", "submitterKey"], {
    id: str,
    targetType: { enum: ["claim", "initiative"] },
    targetId: str,
    category: str,
    proposedCorrection: { bsonType: "string", maxLength: 4000 },
    evidenceUrl: { bsonType: "string", pattern: "^https://", maxLength: 2000 },
    explanation: { bsonType: "string", maxLength: 6000 },
    attribution: strNull,
    contactCiphertext: strNull,
    contactExpiresAt: strNull,
    state: { enum: ["submitted", "under_review", "disputed", "accepted", "partially_accepted", "rejected", "resolved"] },
    submittedAt: str,
    submitterKey: str,
  }),
  [AUX_COLLECTIONS.meta]: schema(["datasetVersion", "meta", "vote", "loadedAt"], { datasetVersion: str, loadedAt: str, meta: obj, vote: obj }),
  [AUX_COLLECTIONS.snapshots]: schema(["snapshotId", "createdAt", "status"], { snapshotId: str, createdAt: str, status: { enum: ["valid", "invalid"] } }),
  [AUX_COLLECTIONS.metrics]: schema(["datasetVersion", "scope", "values"], { datasetVersion: str, scope: str, values: obj }),
  [AUX_COLLECTIONS.methodology]: schema(["version", "metrics"], { version: str, metrics: arr }),
  [AUX_COLLECTIONS.researchResults]: schema(["initiativeId", "task", "result"], { initiativeId: str, task: str }),
};

export const INDEXES: Record<string, { key: Document; unique?: boolean; name: string }[]> = {
  [COLLECTIONS.initiatives]: [{ key: { slug: 1 }, unique: true, name: "slug_unique" }, { key: { organizationId: 1 }, name: "org" }],
  [COLLECTIONS.milestones]: [{ key: { initiativeId: 1, index: 1 }, unique: true, name: "initiative_index_unique" }],
  [COLLECTIONS.pledges]: [{ key: { initiativeId: 1 }, name: "initiative" }, { key: { backerId: 1 }, name: "backer" }],
  [COLLECTIONS.donations]: [{ key: { initiativeId: 1, txHash: 1 }, unique: true, name: "initiative_tx_unique" }],
  [COLLECTIONS.organizations]: [{ key: { name: 1 }, name: "name" }],
  [COLLECTIONS.aliases]: [{ key: { organizationId: 1 }, name: "org" }, { key: { alias: 1 }, name: "alias" }],
  [COLLECTIONS.repositories]: [{ key: { fullName: 1 }, unique: true, name: "full_name_unique" }],
  [COLLECTIONS.claims]: [{ key: { initiativeId: 1, status: 1 }, name: "initiative_status" }, { key: { kind: 1 }, name: "kind" }],
  [COLLECTIONS.evidence]: [{ key: { url: 1 }, name: "url" }, { key: { kind: 1 }, name: "kind" }],
  [COLLECTIONS.relationships]: [{ key: { "from.id": 1 }, name: "from" }, { key: { "to.id": 1 }, name: "to" }],
  [COLLECTIONS.revisions]: [{ key: { initiativeId: 1, n: 1 }, unique: true, name: "initiative_n_unique" }],
  [COLLECTIONS.changes]: [{ key: { detectedAt: -1 }, name: "detected" }, { key: { initiativeId: 1 }, name: "initiative" }],
  [COLLECTIONS.researchJobs]: [{ key: { initiativeId: 1, task: 1 }, unique: true, name: "initiative_task_unique" }],
  [AUX_COLLECTIONS.corrections]: [
    { key: { state: 1, submittedAt: -1 }, name: "state_submitted" },
    { key: { submitterKey: 1, submittedAt: -1 }, name: "rate_limit" },
    { key: { targetId: 1 }, name: "target" },
    { key: { contactExpiresAt: 1 }, name: "contact_expiry" },
  ],
  [AUX_COLLECTIONS.snapshots]: [{ key: { snapshotId: 1 }, unique: true, name: "snapshot_unique" }],
  [AUX_COLLECTIONS.metrics]: [{ key: { datasetVersion: 1, scope: 1 }, unique: true, name: "version_scope_unique" }],
  [AUX_COLLECTIONS.methodology]: [{ key: { version: 1 }, unique: true, name: "version_unique" }],
  [AUX_COLLECTIONS.researchResults]: [{ key: { initiativeId: 1, task: 1 }, unique: true, name: "initiative_task_unique" }],
};

export async function setupDatabase(db: Db, log: (m: string) => void = () => undefined): Promise<void> {
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  for (const [name, validator] of Object.entries(VALIDATORS)) {
    if (!existing.has(name)) {
      await db.createCollection(name, { validator, validationLevel: "strict", validationAction: "error" });
      log(`created ${name}`);
    } else {
      await db.command({ collMod: name, validator, validationLevel: "strict", validationAction: "error" });
    }
    for (const ix of INDEXES[name] ?? []) await db.collection(name).createIndex(ix.key, { unique: ix.unique ?? false, name: ix.name });
  }
}

/**
 * Load a validated dataset. Upserts every record (idempotent), removes records that are no
 * longer in the dataset only after all upserts succeed, then moves the `current` pointer.
 */
export async function loadDataset(db: Db, d: Dataset, extras: { snapshots?: Document[]; researchResults?: Document[] } = {}, log: (m: string) => void = () => undefined) {
  const version = d.meta.datasetVersion;
  for (const [key, coll] of Object.entries(COLLECTIONS) as [Exclude<keyof Dataset, "meta" | "vote">, string][]) {
    const rows = d[key] as { id: string }[];
    const c = db.collection(coll);
    for (let i = 0; i < rows.length; i += 500) {
      const ops = rows.slice(i, i + 500).map((r) => ({ replaceOne: { filter: { _id: r.id as never }, replacement: { ...r, datasetVersion: version }, upsert: true } }));
      if (ops.length) await c.bulkWrite(ops, { ordered: false });
    }
    const removed = await c.deleteMany({ _id: { $nin: rows.map((r) => r.id) as never[] } });
    log(`${coll}: ${rows.length} upserted, ${removed.deletedCount} removed`);
  }
  for (const s of extras.snapshots ?? []) await db.collection(AUX_COLLECTIONS.snapshots).replaceOne({ snapshotId: s.snapshotId }, s, { upsert: true });
  for (const r of extras.researchResults ?? []) await db.collection(AUX_COLLECTIONS.researchResults).replaceOne({ initiativeId: r.initiativeId, task: r.task }, r, { upsert: true });
  await db.collection(AUX_COLLECTIONS.metrics).replaceOne({ datasetVersion: version, scope: "cohort" }, { datasetVersion: version, scope: "cohort", values: cohortMetrics(d) }, { upsert: true });
  for (const ini of d.initiatives)
    await db.collection(AUX_COLLECTIONS.metrics).replaceOne({ datasetVersion: version, scope: ini.id }, { datasetVersion: version, scope: ini.id, values: initiativeMetrics(d, ini) }, { upsert: true });
  await db.collection(AUX_COLLECTIONS.methodology).replaceOne({ version: METHODOLOGY_VERSION }, { version: METHODOLOGY_VERSION, metrics: METRICS, recordedAt: new Date().toISOString() }, { upsert: true });
  await db.collection(AUX_COLLECTIONS.meta).replaceOne({ _id: "current" as never }, { datasetVersion: version, meta: d.meta, vote: d.vote, loadedAt: new Date().toISOString() }, { upsert: true });
  log(`dataset_meta.current → ${version}`);
}
