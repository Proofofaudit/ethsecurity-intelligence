import type { EntityType, Relationship } from "@/lib/domain/schemas";

export type EdgeType = Relationship["type"] | "has_milestone";
export type Confidence = Relationship["confidence"];

export const ENTITY_LABEL: Record<EntityType, string> = {
  initiative: "Initiative",
  organization: "Organization",
  backer: "Backer",
  person: "Public contributor",
  repository: "Repository",
  technology: "Technology",
  standard: "Standard",
  product: "Product",
  integration: "Integration",
  milestone: "Milestone",
  problem: "Security problem",
};

export const RELATION_LABEL: Record<EdgeType, string> = {
  funds: "funds",
  develops: "develops",
  maintains: "maintains",
  integrates: "integrates",
  depends_on: "depends on",
  addresses: "addresses",
  proposes: "proposes",
  references: "references",
  potentially_overlaps: "potentially overlaps",
  potentially_complements: "potentially complements",
  has_milestone: "has milestone",
};

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  confirmed: "Confirmed by official or observed evidence",
  stated: "Stated in proposal text",
  inferred: "Inferred by a rule (not confirmed)",
};

export const isHypothesis = (t: EdgeType) => t === "potentially_overlaps" || t === "potentially_complements";

/** Short qualifier shown next to every inferred edge so it is never read as fact. */
export function edgeQualifier(type: EdgeType, confidence: Confidence): string | null {
  if (isHypothesis(type)) return "hypothesis";
  if (confidence === "inferred") return "rule-based";
  if (confidence === "stated") return "stated";
  return null;
}

export const splitKey = (key: string): { type: EntityType; id: string } => {
  const i = key.indexOf(":");
  return { type: key.slice(0, i) as EntityType, id: key.slice(i + 1) };
};
