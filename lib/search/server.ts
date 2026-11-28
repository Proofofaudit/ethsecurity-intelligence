import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseBadgeHolderCsv, type BadgeHolder } from "./badge-holders";

/** Default location of the public badge-holder CSV. ESI_BADGE_HOLDERS_CSV overrides it (tests). */
export const BADGE_HOLDERS_CSV = join("data", "badge-holders", "badge-holders.csv");

/** Reads and parses the CSV on the server. Returns null when the file is absent or unreadable, never an invented list. */
export function loadBadgeHolders(path: string = process.env.ESI_BADGE_HOLDERS_CSV || join(process.cwd(), BADGE_HOLDERS_CSV)): BadgeHolder[] | null {
  try {
    if (!existsSync(path)) return null;
    const holders = parseBadgeHolderCsv(readFileSync(path, "utf8"));
    return holders.length ? holders : null;
  } catch {
    return null;
  }
}
