import { latestValidSnapshot } from "@/research/store";
import { normalize } from "@/research/normalize";
import { collect } from "@/research/collect";
import { collectRound1 } from "@/research/round1";

const args = process.argv.slice(2);
const round1 = args.length === 0 || args.includes("round1");
const tasks = args.filter((t) => t !== "round1");
if (round1) await collectRound1();
if (args.length === 0 || tasks.length) {
  const manifest = await latestValidSnapshot();
  if (!manifest) {
    console.error("No valid official snapshot. Run `npm run ingest` first.");
    process.exit(1);
  }
  const layer = await normalize(manifest);
  await collect(layer, { tasks: tasks.length ? tasks : undefined });
}
