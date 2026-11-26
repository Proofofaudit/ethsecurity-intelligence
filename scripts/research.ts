import { latestValidSnapshot } from "@/research/store";
import { normalize } from "@/research/normalize";
import { collect } from "@/research/collect";

const tasks = process.argv.slice(2);
const manifest = await latestValidSnapshot();
if (!manifest) {
  console.error("No valid official snapshot. Run `npm run ingest` first.");
  process.exit(1);
}
const layer = await normalize(manifest);
await collect(layer, { tasks: tasks.length ? tasks : undefined });
