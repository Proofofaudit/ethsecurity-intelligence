/**
 * Team research (Items 15 to 17). Collects public GitHub facts for the handles and owners an
 * initiative links, then builds data/published/team-research.json from curated records.
 *
 *   npx tsx scripts/research-team.ts --help
 *   npx tsx scripts/research-team.ts --initiative <slug|id> [--initiative ...] [--max-requests N]
 *   npx tsx scripts/research-team.ts --all
 *   npx tsx scripts/research-team.ts --build-only
 */
import { loadPublishedDataset } from "@/lib/db/file-store";
import { githubTargets, collectTeamGithub, writeTeamMachineResult, DEFAULT_MAX_REQUESTS } from "@/research/team";
import { buildTeamResearchFromDisk, readCuratedTeam } from "@/research/team-build";
import { githubRequests } from "@/research/github";

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: research-team [--initiative <slug|id>]... [--all] [--build-only] [--no-build] [--max-requests N]
  --initiative  collect GitHub facts for one initiative (repeatable)
  --all         collect for every initiative that has a GitHub handle or owner
  --build-only  skip collection, rebuild data/published/team-research.json
  --no-build    collect only
  --max-requests  GitHub request cap per initiative (default ${DEFAULT_MAX_REQUESTS}); cached responses are free`);
  process.exit(0);
}
const values = (flag: string) => args.flatMap((a, i) => (a === flag && args[i + 1] ? [args[i + 1]!] : []));
const maxRequests = Number(values("--max-requests")[0] ?? DEFAULT_MAX_REQUESTS);
if (!Number.isFinite(maxRequests) || maxRequests < 1) throw new Error("--max-requests must be a positive number");

const dataset = await loadPublishedDataset();
if (!args.includes("--build-only")) {
  const wanted = new Set(values("--initiative"));
  const chosen = args.includes("--all") ? dataset.initiatives : dataset.initiatives.filter((i) => wanted.has(i.id) || wanted.has(i.slug));
  if (!chosen.length) throw new Error("No initiative selected. Use --initiative <slug|id> or --all.");
  const curated = await readCuratedTeam();
  for (const ini of chosen) {
    const profileUrls = dataset.people.filter((p) => p.initiativeIds.includes(ini.id)).flatMap((p) => p.publicProfiles);
    const linkUrls = [...ini.links, ...ini.textLinks.map((l) => l.url)];
    const targets = githubTargets({ linkUrls, profileUrls, curated: curated.get(ini.slug) ?? null });
    if (!targets.owners.length) {
      console.log(`${ini.slug}: no GitHub handle or owner linked, skipped`);
      continue;
    }
    const r = await collectTeamGithub(ini.id, targets, { maxRequests });
    await writeTeamMachineResult(r);
    console.log(`${ini.slug}: ${r.owners.length} owners, ${r.people.length} handles, ${r.requests} requests${r.truncated ? " (request cap reached)" : ""}`);
  }
  console.log(`GitHub requests this run: ${githubRequests}`);
}
if (!args.includes("--no-build")) {
  const file = await buildTeamResearchFromDisk(dataset);
  console.log(`team-research.json: ${file.initiatives.length} initiatives listed, coverage ${JSON.stringify(file.meta.coverage)}`);
}
