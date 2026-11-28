/**
 * Start a free local MongoDB (Community Server binary fetched by mongodb-memory-server) with
 * persistent storage in .data/mongo. Prints a MONGODB_URI to use with db:setup / db:load / dev.
 * Keep it running in its own terminal; Ctrl+C stops it.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { MongoMemoryServer } from "mongodb-memory-server";

const dbPath = path.join(process.cwd(), ".data", "mongo");
mkdirSync(dbPath, { recursive: true });
const port = Number(process.env.LOCAL_MONGO_PORT ?? 27027);
const server = await MongoMemoryServer.create({ instance: { dbPath, port, storageEngine: "wiredTiger" } });
console.log(`Local MongoDB running. Use:\n  MONGODB_URI=${server.getUri()}`);
const stop = async () => {
  await server.stop({ doCleanup: false });
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
