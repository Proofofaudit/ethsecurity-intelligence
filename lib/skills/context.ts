/**
 * Dataset facts that generated research briefs may state. Built on the server from the
 * published dataset, passed to the browser configurator and the skills builder, so every name,
 * count and definition in a generated brief comes from the data.
 */
import { z } from "zod";
import { COI_ORGANIZATION_ID, COI_SHORT, REPO_URL } from "@/lib/disclosure";
import { EVIDENCE_STATUS_LABEL, type Dataset, type EvidenceStatus } from "@/lib/domain/schemas";
import { SECURITY_PROBLEMS } from "@/lib/domain/taxonomy";
import { categoryDistribution, displayName, summarize } from "@/lib/intelligence/service";
import { METRICS } from "@/lib/metrics/registry";
import { ResearchOutputSchema } from "./schema";

export interface SkillInitiative {
  id: string;
  slug: string;
  name: string;
  /** Official title (the server's alphabetical order uses it). */
  title: string;
  type: "grant" | "rfp";
  organizationId: string | null;
  organization: string | null;
  categories: string[];
  stages: string[];
  goalCents: number;
  /** Official raised as a fraction of goal, or null when unavailable. */
  pct: number | null;
}

export interface SkillContext {
  siteUrl: string;
  repoUrl: string;
  datasetVersion: string;
  methodologyVersion: string;
  officialSourceUrl: string;
  cohortSize: number;
  cohortFrozenAt: string;
  initiatives: SkillInitiative[];
  organizations: { id: string; name: string; initiatives: number }[];
  categories: { slug: string; label: string; count: number }[];
  stages: { id: string; label: string; description: string }[];
  metrics: { id: string; name: string; description: string; unit: string }[];
  statuses: { id: EvidenceStatus; label: string }[];
  coi: { text: string; initiatives: { slug: string; title: string }[] };
  outputJsonSchema: Record<string, unknown>;
}

export function buildSkillContext(d: Dataset, siteUrl: string): SkillContext {
  const initiatives = d.initiatives
    .map((i): SkillInitiative => {
      const s = summarize(d, i);
      return {
        id: i.id,
        slug: i.slug,
        name: displayName(d, i),
        title: i.title,
        type: i.type,
        organizationId: i.organizationId,
        organization: s.organization,
        categories: i.categories.map((c) => c.slug),
        stages: i.stages.map((x) => x.stage),
        goalCents: i.funding.goalCents,
        pct: s.pct,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const orgCounts = new Map<string, number>();
  for (const i of d.initiatives) if (i.organizationId) orgCounts.set(i.organizationId, (orgCounts.get(i.organizationId) ?? 0) + 1);
  const organizations = [...orgCounts]
    .map(([id, n]) => ({ id, name: d.organizations.find((o) => o.id === id)?.name ?? id, initiatives: n }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    siteUrl: siteUrl.replace(/\/+$/, ""),
    repoUrl: REPO_URL,
    datasetVersion: d.meta.datasetVersion,
    methodologyVersion: d.meta.methodologyVersion,
    officialSourceUrl: d.meta.officialSourceUrl,
    cohortSize: d.meta.cohort.size,
    cohortFrozenAt: d.meta.cohort.frozenAt,
    initiatives,
    organizations,
    categories: categoryDistribution(d).map((c) => ({ slug: c.slug, label: c.label, count: c.count })),
    stages: SECURITY_PROBLEMS.map((p) => ({ id: p.id, label: p.label, description: p.description })),
    metrics: METRICS.filter((m) => m.level === "initiative").map((m) => ({ id: m.id, name: m.name, description: m.description, unit: m.unit })),
    statuses: (Object.keys(EVIDENCE_STATUS_LABEL) as EvidenceStatus[]).map((id) => ({ id, label: EVIDENCE_STATUS_LABEL[id] })),
    coi: {
      text: COI_SHORT,
      initiatives: d.initiatives.filter((i) => i.organizationId === COI_ORGANIZATION_ID).map((i) => ({ slug: i.slug, title: i.title })),
    },
    outputJsonSchema: z.toJSONSchema(ResearchOutputSchema) as Record<string, unknown>,
  };
}
