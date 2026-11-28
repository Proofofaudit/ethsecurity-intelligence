import { FileStore } from "./file-store";
import { MongoStore } from "./mongo-store";
import { redactSecrets } from "./redact";
import type { IntelligenceStore } from "./types";

const g = globalThis as unknown as { __esiStore?: IntelligenceStore; __esiMongoFailedAt?: number };

/**
 * Returns the configured store. With MONGODB_URI set, MongoDB is primary; if it cannot be
 * reached the app serves the published dataset file read-only (corrections disabled) and
 * retries MongoDB after 30 seconds.
 */
export async function getStore(): Promise<IntelligenceStore> {
  const uri = process.env.MONGODB_URI;
  if (!uri) return (g.__esiStore ??= new FileStore());
  if (g.__esiMongoFailedAt && Date.now() - g.__esiMongoFailedAt < 30_000) return new FileStore("recent connection failure");
  const mongo = g.__esiStore instanceof MongoStore ? g.__esiStore : new MongoStore(uri, process.env.MONGODB_DB ?? "ethsecurity_intelligence");
  try {
    await mongo.getDataset();
    g.__esiStore = mongo;
    g.__esiMongoFailedAt = undefined;
    return mongo;
  } catch (err) {
    g.__esiMongoFailedAt = Date.now();
    const reason = redactSecrets(err instanceof Error ? err.message : String(err), uri);
    console.error("[store] MongoDB unavailable, serving file dataset read-only:", reason);
    return new FileStore(reason.slice(0, 120));
  }
}
