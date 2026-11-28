/**
 * Read-only loaders for the team research artifact beyond the interface contract.
 * lib/team/load.ts stays the interface workstream's loader; these helpers expose the extra
 * optional fields (coverage, structured questions) without editing it.
 */
import { loadTeamResearchFile } from "@/lib/team/load";
import type { TeamResearchFile } from "@/lib/team/types";

export interface TeamCoverage {
  total: number;
  teamDossier: number;
  delivery: number;
  claimChecks: number;
  complete: number;
}

type WithMeta = TeamResearchFile & { meta?: { coverage?: TeamCoverage; sourceLabels?: string[] } };

/** The published file as written, including optional fields. Null when missing or malformed. */
export function loadTeamResearchRaw(path?: string): WithMeta | null {
  return loadTeamResearchFile(path) as WithMeta | null;
}

/** Coverage counts from the artifact meta, or null when the artifact is missing. */
export function loadCoverage(path?: string): TeamCoverage | null {
  return loadTeamResearchRaw(path)?.meta?.coverage ?? null;
}

/** Structured questions (with rule ids and sources) for an initiative, or [] when none are stored. */
export function getTeamStructuredQuestions(initiativeId: string, path?: string): unknown[] {
  const ini = loadTeamResearchRaw(path)?.initiatives.find((i) => i.initiativeId === initiativeId) as { structuredQuestions?: unknown[] } | undefined;
  return ini?.structuredQuestions ?? [];
}
