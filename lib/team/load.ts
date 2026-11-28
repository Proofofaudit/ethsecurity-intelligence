import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { TeamResearch, TeamResearchFile, TeamResearchResult } from "./types";

const FILE = join(process.cwd(), "data", "published", "team-research.json");
const NOT_RESEARCHED = { researched: false, reason: "Not researched yet" } as const;

/** Reads the published team research file. Tolerates a missing or malformed file. */
export function loadTeamResearchFile(path: string = FILE): TeamResearchFile | null {
  try {
    if (!existsSync(path)) return null;
    const parsed = JSON.parse(readFileSync(path, "utf8")) as TeamResearchFile;
    return parsed && Array.isArray(parsed.initiatives) ? parsed : null;
  } catch {
    return null;
  }
}

export function loadTeamResearch(initiativeId: string, path?: string): TeamResearchResult {
  const file = loadTeamResearchFile(path);
  const data: TeamResearch | undefined = file?.initiatives.find((i) => i.initiativeId === initiativeId);
  return data ? { researched: true, data } : NOT_RESEARCHED;
}
