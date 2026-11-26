import { ingest } from "@/research/ingest";

ingest()
  .then((m) => process.exit(m.status === "valid" ? 0 : 2))
  .catch((err) => {
    console.error("Ingestion aborted; no snapshot written.", err);
    process.exit(1);
  });
