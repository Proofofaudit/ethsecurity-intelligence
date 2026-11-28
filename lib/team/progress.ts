import { loadTeamResearchFile } from "./load";

/** Number of initiatives with team research published. Zero when the file is absent or malformed. */
export function teamResearchCompleteCount(cohortIds?: readonly string[], path?: string): number {
  const file = loadTeamResearchFile(path);
  if (!file) return 0;
  const ids = new Set(file.initiatives.map((i) => i.initiativeId));
  return cohortIds ? cohortIds.filter((id) => ids.has(id)).length : ids.size;
}

export const AUTOMATED_CHECKS_NOTE = "not a human review";

export function automatedChecksLabel(done: number, total: number): string {
  return `Automated checks complete: ${done} of ${total} (${AUTOMATED_CHECKS_NOTE})`;
}

export function teamResearchLabel(done: number, total: number): string {
  return `Team research complete: ${done} of ${total}`;
}
