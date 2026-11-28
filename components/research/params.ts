/**
 * URL <-> Filter mapping for the Initiatives grid. Pure functions shared by the server page
 * (which runs filterInitiatives) and the client controls (which write the URL).
 */
import type { Filter } from "@/lib/intelligence/service";

export type SP = Record<string, string | string[] | undefined>;
export type YesNo = "yes" | "no" | "";

export interface ResearchParams {
  q: string;
  cat: string[];
  stage: string[];
  type: "grant" | "rfp" | "";
  gmin: string;
  gmax: string;
  fmin: string;
  fmax: string;
  existing: YesNo;
  evidence: YesNo;
  done: YesNo;
  integrations: YesNo;
  adoption: "has" | "none" | "";
  research: "complete" | "incomplete" | "";
  std: string;
  org: string;
  /** Affiliation: "any" shared official group, "none", or the name of one manifest group. */
  aff: string;
  /** Possible overlaps filter: initiatives with a similar-initiative pair (any label, or one label). */
  similar: "any" | "overlap" | "complement" | "";
  sort: "" | "title" | "goal" | "raised" | "pct" | "ask" | "remaining" | "milestones";
  order: "asc" | "desc" | "";
  view: "table" | "cards";
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const list = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v.join(",") : (v ?? ""))
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
const oneOf = <T extends string>(v: string, opts: readonly T[]): T | "" => ((opts as readonly string[]).includes(v) ? (v as T) : "");
const numStr = (v: string) => (/^\d+(\.\d+)?$/.test(v) ? v : "");

export function parseParams(sp: SP): ResearchParams {
  return {
    q: first(sp.q).slice(0, 200),
    cat: list(sp.cat).slice(0, 20),
    stage: list(sp.stage).slice(0, 11),
    type: oneOf(first(sp.type), ["grant", "rfp"] as const),
    gmin: numStr(first(sp.gmin)),
    gmax: numStr(first(sp.gmax)),
    fmin: numStr(first(sp.fmin)),
    fmax: numStr(first(sp.fmax)),
    existing: oneOf(first(sp.existing), ["yes", "no"] as const),
    evidence: oneOf(first(sp.evidence), ["yes", "no"] as const),
    done: oneOf(first(sp.done), ["yes", "no"] as const),
    integrations: oneOf(first(sp.integrations), ["yes", "no"] as const),
    adoption: oneOf(first(sp.adoption), ["has", "none"] as const),
    research: oneOf(first(sp.research), ["complete", "incomplete"] as const),
    std: first(sp.std).slice(0, 20),
    org: first(sp.org).slice(0, 120),
    aff: first(sp.aff).slice(0, 120),
    similar: oneOf(first(sp.similar), ["any", "overlap", "complement"] as const),
    sort: oneOf(first(sp.sort), ["title", "goal", "raised", "pct", "ask", "remaining", "milestones"] as const),
    order: oneOf(first(sp.order), ["asc", "desc"] as const),
    view: first(sp.view) === "table" ? "table" : "cards",
  };
}

const yn = (v: YesNo) => (v === "yes" ? true : v === "no" ? false : undefined);

/** Converts URL params to the shared FilterSchema input. Values are validated again by the caller. */
export function toFilter(p: ResearchParams): Filter {
  const f: Filter = { limit: 100 };
  if (p.q) f.q = p.q;
  if (p.cat.length) f.categories = p.cat;
  if (p.stage.length) f.stages = p.stage as Filter["stages"];
  if (p.type) f.type = p.type;
  if (p.gmin) f.goalMinUsd = Number(p.gmin);
  if (p.gmax) f.goalMaxUsd = Number(p.gmax);
  if (p.fmin) f.fundedMinPct = Math.min(100, Number(p.fmin));
  if (p.fmax) f.fundedMaxPct = Math.min(100, Number(p.fmax));
  if (yn(p.existing) !== undefined) f.existingWork = yn(p.existing);
  if (yn(p.evidence) !== undefined) f.hasSupportedEvidence = yn(p.evidence);
  if (yn(p.done) !== undefined) f.hasCompletedMilestone = yn(p.done);
  if (yn(p.integrations) !== undefined) f.hasPlannedIntegrations = yn(p.integrations);
  if (p.adoption) f.adoption = p.adoption;
  if (p.research) f.researchComplete = p.research === "complete";
  if (p.std) f.standard = p.std;
  if (p.org) f.organizationId = p.org;
  if (p.similar) f.similar = p.similar;
  if (p.sort) f.sort = p.sort;
  if (p.order) f.order = p.order;
  return f;
}

/** Serializes params to a query string, omitting defaults. */
export function toQuery(p: ResearchParams): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) {
    if (k === "view" && v === "cards") continue;
    if (Array.isArray(v)) {
      if (v.length) u.set(k, v.join(","));
    } else if (v) u.set(k, String(v));
  }
  return u.toString();
}

export function activeFilterCount(p: ResearchParams): number {
  const keys: (keyof ResearchParams)[] = ["q", "type", "gmin", "gmax", "fmin", "fmax", "existing", "evidence", "done", "integrations", "adoption", "research", "std", "org", "aff", "similar"];
  return keys.filter((k) => !!p[k]).length + p.cat.length + p.stage.length;
}
