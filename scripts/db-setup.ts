import { MongoClient } from "mongodb";
import { describeError } from "@/lib/db/redact";
import { setupDatabase } from "@/lib/db/setup";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is not set. See .env.example.");
  process.exit(1);
}
try {
  const client = await MongoClient.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  try {
    await setupDatabase(client.db(process.env.MONGODB_DB ?? "ethsecurity_intelligence"), console.log);
    console.log("Collections, validators and indexes are in place.");
  } finally {
    await client.close();
  }
} catch (err) {
  console.error(`db:setup failed: ${describeError(err, uri)}`);
  process.exit(3);
}
