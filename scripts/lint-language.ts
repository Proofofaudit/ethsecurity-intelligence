/** Neutral-language source lint (NEUTRAL_LANGUAGE.md). Exits 1 and lists every hit when a banned phrase is found. */
import path from "node:path";
import { formatHit, lintPaths } from "@/lib/neutralLanguageLint";

const root = path.resolve(import.meta.dirname, "..");
const hits = await lintPaths(root);
if (hits.length) {
  for (const h of hits) console.error(formatHit(h));
  console.error(`\n${hits.length} banned ${hits.length === 1 ? "phrase" : "phrases"} found. See NEUTRAL_LANGUAGE.md.`);
  process.exit(1);
}
console.log("Neutral-language lint: no banned phrases.");
