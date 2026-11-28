/**
 * Builds data/published/team-research.json from curated team records, stored machine results,
 * the published dataset (Round 1 matches) and the merged question generator. The output conforms
 * to lib/team/types.ts (TeamResearchFile) and adds optional fields: meta, passes, notFound,
 * sourceLabel and structuredQuestions. Only initiatives with a curated record are listed;
 * coverage counts all cohort initiatives.
 */
import path from "node:path";
import { promises as fs } from "node:fs";
import type { Dataset } from "@/lib/domain/schemas";
import type { TeamResearch, TeamResearchFile, TeamMember, OrganizationProfile, DeliveryTimelineEntry, ClaimCheck } from "@/lib/team/types";
import { parseCuratedTeam, type CuratedTeamRecord } from "@/lib/research-v2/schemas";
import { mergedQuestions, questionLine } from "@/lib/research-v2/questions";
import { SOURCE_LABELS } from "@/lib/neutralLanguage";
import { DATA_DIR, PUBLISHED_DIR, writeJson } from "./store";
import { TEAM_RESEARCH_DIR, readTeamMachineResult, type TeamMachineResult } from "./team";

export const CURATED_TEAM_DIR = path.join(DATA_DIR, "curated", "team");
export const TEAM_RESEARCH_FILE = path.join(PUBLISHED_DIR, "team-research.json");
export const RESEARCH_SOURCE_LABEL = "AI-assisted";

export interface Coverage {
  total: number;
  teamDossier: number;
  delivery: number;
  claimChecks: number;
  complete: number;
}

export type PublishedMember = TeamMember & {
  pseudonymous: boolean;
  sourceUrl: string;
  handles: (TeamMember["handles"][number] & { publishedBy: string })[];
  pastWork: (TeamMember["pastWork"][number] & { kind: string })[];
};
export type PublishedOrganization = OrganizationProfile & {
  founded?: string;
  publicTeamSize?: number;
  previousFunding: { label: string; url: string }[];
  otherProducts: { label: string; url: string }[];
};
export type PublishedTeamResearch = Omit<TeamResearch, "members" | "organization" | "deliveryTimeline"> & {
  members: PublishedMember[];
  organization: PublishedOrganization | null;
  deliveryTimeline: (DeliveryTimelineEntry & { round1RecordId?: string })[];
  claimChecks: (ClaimCheck & { method: string })[];
  passes: CuratedTeamRecord["passes"];
  notFound: string[];
  sourceLabel: string;
  checkedOn: string;
  structuredQuestions?: unknown[];
};
export type PublishedTeamFile = TeamResearchFile & {
  meta: { coverage: Coverage; sourceLabels: string[] };
  initiatives: PublishedTeamResearch[];
};

export function coverageOf(total: number, records: { passes: CuratedTeamRecord["passes"] }[]): Coverage {
  return {
    total,
    teamDossier: records.filter((r) => r.passes.team).length,
    delivery: records.filter((r) => r.passes.delivery).length,
    claimChecks: records.filter((r) => r.passes.claims).length,
    complete: records.filter((r) => r.passes.team && r.passes.delivery && r.passes.claims).length,
  };
}

export interface BuildInput {
  dataset: Pick<Dataset, "initiatives" | "round1">;
  curatedBySlug: Map<string, CuratedTeamRecord>;
  machineById: Map<string, TeamMachineResult>;
  /** Merged question lines (each with source link text) for an initiative id. Defaults to none. */
  questionsFor?: (initiativeId: string) => string[];
  /** Structured merged questions (topic, sources, origins) for an initiative id. Stored as structuredQuestions. */
  structuredQuestionsFor?: (initiativeId: string) => unknown[];
  now?: Date;
}

function memberCommits(machine: TeamMachineResult | undefined, handles: CuratedTeamRecord["members"][number]["handles"]): number[] {
  const gh = handles.find((h) => h.platform.toLowerCase() === "github");
  if (!gh || !machine) return [];
  const login = /github\.com\/([A-Za-z0-9-]+)/i.exec(gh.url)?.[1]?.toLowerCase() ?? gh.handle.toLowerCase();
  const p = machine.people.find((x) => x.handle.toLowerCase() === login);
  return p && p.monthly.length === 12 ? [...p.monthly] : [];
}

export function buildTeamResearch(input: BuildInput): PublishedTeamFile {
  const initiatives: PublishedTeamResearch[] = [];
  const known = new Map(input.dataset.initiatives.map((i) => [i.slug, i]));
  for (const slug of [...input.curatedBySlug.keys()].sort()) {
    const ini = known.get(slug);
    if (!ini) throw new Error(`Curated team record "${slug}" does not match any initiative slug`);
    const rec = input.curatedBySlug.get(slug)!;
    const machine = input.machineById.get(ini.id);
    const r1 = new Set((input.dataset.round1.initiativeMatches[ini.id] ?? []).map((m) => m.projectId));
    for (const d of rec.delivery) {
      if (d.round1RecordId && !r1.has(d.round1RecordId)) throw new Error(`${slug}: round1RecordId ${d.round1RecordId} is not a published Round 1 match`);
    }
    initiatives.push({
      initiativeId: ini.id,
      members: rec.members.map((m) => ({
        name: m.name,
        role: m.role,
        pseudonymous: m.pseudonymous,
        handles: m.handles.map((h) => ({ platform: h.platform, handle: h.handle, url: h.url, publishedBy: h.publishedBy })),
        pastWork: m.pastWork.map((w) => ({ label: w.label, url: w.url, checkedOn: w.checkedOn, kind: w.kind })),
        githubMonthlyCommits: memberCommits(machine, m.handles),
        sourceUrl: m.sourceUrl,
        checkedOn: m.checkedOn,
      })),
      organization: rec.organization
        ? {
            name: rec.organization.name,
            summary: rec.organization.summary,
            ...(rec.organization.website ? { website: rec.organization.website } : {}),
            ...(rec.organization.founded ? { founded: rec.organization.founded } : {}),
            ...(rec.organization.publicTeamSize !== undefined ? { publicTeamSize: rec.organization.publicTeamSize } : {}),
            previousFunding: rec.organization.previousFunding,
            otherProducts: rec.organization.otherProducts,
            sources: rec.organization.sources,
            checkedOn: rec.organization.checkedOn,
          }
        : null,
      deliveryTimeline: rec.delivery.map((d) => ({
        grant: d.grant,
        funder: d.funder,
        promised: d.promised,
        status: d.status,
        sources: d.sources,
        checkedOn: d.checkedOn,
        ...(d.round1RecordId ? { round1RecordId: d.round1RecordId } : {}),
      })),
      claimChecks: rec.claims.map((c) => ({
        claim: c.claim,
        status: c.status,
        sources: c.sources,
        checkedOn: c.checkedOn,
        method: c.method,
        ...(c.breakdown ? { breakdown: c.breakdown, totalLabel: c.totalLabel } : {}),
      })),
      questions: input.questionsFor?.(ini.id) ?? [],
      ...(input.structuredQuestionsFor ? { structuredQuestions: input.structuredQuestionsFor(ini.id) } : {}),
      passes: rec.passes,
      notFound: rec.notFound,
      sourceLabel: RESEARCH_SOURCE_LABEL,
      checkedOn: rec.checkedOn,
    });
  }
  return {
    generatedAt: (input.now ?? new Date()).toISOString(),
    meta: { coverage: coverageOf(input.dataset.initiatives.length, initiatives), sourceLabels: [...Object.values(SOURCE_LABELS), RESEARCH_SOURCE_LABEL] },
    initiatives,
  };
}

export async function readCuratedTeam(dir = CURATED_TEAM_DIR): Promise<Map<string, CuratedTeamRecord>> {
  const out = new Map<string, CuratedTeamRecord>();
  let names: string[] = [];
  try {
    names = (await fs.readdir(dir)).filter((n) => n.endsWith(".json")).sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  for (const n of names) out.set(n.slice(0, -5), parseCuratedTeam(JSON.parse(await fs.readFile(path.join(dir, n), "utf8")), n));
  return out;
}

export async function buildTeamResearchFromDisk(dataset: Dataset, opts: { questionsFor?: BuildInput["questionsFor"]; structuredQuestionsFor?: BuildInput["structuredQuestionsFor"]; now?: Date; write?: boolean } = {}): Promise<PublishedTeamFile> {
  const curatedBySlug = await readCuratedTeam();
  const machineById = new Map<string, TeamMachineResult>();
  for (const ini of dataset.initiatives) {
    const m = await readTeamMachineResult(ini.id, TEAM_RESEARCH_DIR);
    if (m) machineById.set(ini.id, m);
  }
  let file = buildTeamResearch({ dataset, curatedBySlug, machineById, questionsFor: opts.questionsFor, structuredQuestionsFor: opts.structuredQuestionsFor, now: opts.now });
  if (!opts.questionsFor) {
    // Merged questions (Item 20) read the team facts of the first pass, then fill the question lists.
    const merged = mergedQuestions(dataset, file);
    file = buildTeamResearch({
      dataset,
      curatedBySlug,
      machineById,
      questionsFor: (id) => (merged[id] ?? []).map(questionLine),
      structuredQuestionsFor: (id) => merged[id] ?? [],
      now: opts.now ?? new Date(file.generatedAt),
    });
  }
  if (opts.write !== false) await writeJson(TEAM_RESEARCH_FILE, file);
  return file;
}
