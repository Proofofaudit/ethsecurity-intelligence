/** Load data/published/dataset.json (already validated and audited) into MongoDB. */
import { promises as fs } from "node:fs";
import path from "node:path";
import { MongoClient } from "mongodb";
import { describeError } from "@/lib/db/redact";
import { loadDataset, setupDatabase } from "@/lib/db/setup";
import { loadPublishedDataset } from "@/lib/db/file-store";
import { validateDataset } from "@/research/publish";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is not set. See .env.example.");
  process.exit(1);
}
const dataset = await loadPublishedDataset();
const problems = validateDataset(dataset);
if (problems.length) {
  console.error("Refusing to load an invalid dataset:", problems.slice(0, 5));
  process.exit(2);
}
const snapDir = path.join(process.cwd(), "data", "official", "snapshots");
const snapshots = await Promise.all((await fs.readdir(snapDir)).map(async (f) => JSON.parse(await fs.readFile(path.join(snapDir, f), "utf8"))));
const resultsDir = path.join(process.cwd(), "data", "research", "results");
const researchResults = [];
for (const task of await fs.readdir(resultsDir)) {
  for (const f of await fs.readdir(path.join(resultsDir, task))) {
    researchResults.push({ initiativeId: f.replace(/\.json$/, ""), task, result: JSON.parse(await fs.readFile(path.join(resultsDir, task, f), "utf8")) });
  }
}
try {
  const client = await MongoClient.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  try {
    const db = client.db(process.env.MONGODB_DB ?? "ethsecurity_intelligence");
    await setupDatabase(db, console.log);
    await loadDataset(db, dataset, { snapshots, researchResults }, console.log);
  } finally {
    await client.close();
  }
} catch (err) {
  console.error(`db:load failed: ${describeError(err, uri)}`);
  process.exit(3);
}
