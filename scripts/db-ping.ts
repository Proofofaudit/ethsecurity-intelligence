/**
 * Read-only connectivity check for the configured MongoDB (MONGODB_URI). Prints the server
 * version, whether a dataset is loaded and per-collection counts. Never prints the connection
 * string, credentials or cluster host names.
 *
 *   node --env-file=.env.local --import tsx scripts/db-ping.ts
 */
import { MongoClient } from "mongodb";
import { AUX_COLLECTIONS, COLLECTIONS } from "@/lib/db/mongo-store";
import { describeError } from "@/lib/db/redact";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is not set. See .env.example.");
  process.exit(1);
}
const dbName = process.env.MONGODB_DB ?? "ethsecurity_intelligence";
const started = Date.now();
try {
  const client = await MongoClient.connect(uri, { serverSelectionTimeoutMS: 10_000, connectTimeoutMS: 10_000, appName: "ethsecurity-intelligence-ping" });
  try {
    const db = client.db(dbName);
    await db.command({ ping: 1 });
    const info = await db.admin().serverInfo().catch(() => null);
    console.log(`Connected in ${Date.now() - started} ms; MongoDB ${info?.version ?? "version unavailable"}; database ${dbName}`);
    const meta = await db.collection(AUX_COLLECTIONS.meta).findOne({ _id: "current" as never });
    console.log(meta ? `Dataset loaded: ${meta.datasetVersion} at ${meta.loadedAt}` : "No dataset loaded yet (run db:setup and db:load).");
    for (const name of [...Object.values(COLLECTIONS), ...Object.values(AUX_COLLECTIONS)]) {
      console.log(`  ${name}: ${await db.collection(name).estimatedDocumentCount()}`);
    }
  } finally {
    await client.close();
  }
} catch (err) {
  console.error(`MongoDB ping failed after ${Date.now() - started} ms: ${describeError(err, uri)}`);
  process.exit(3);
}
