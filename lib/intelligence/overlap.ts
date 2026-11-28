/**
 * Collaboration discovery and overlap hypotheses between cohort initiatives.
 *
 * For every pair we compute deterministic signals:
 *  - lexical similarity of problem/scope/milestone text (TF-IDF cosine),
 *  - shared lifecycle stages (rule-based classification),
 *  - shared standards (ERC/EIP numbers in text),
 *  - shared cited repositories,
 *  - shared backers (official pledges).
 * A pair becomes a hypothesis when signals pass documented thresholds. Hypotheses are labeled
 * "potentially overlaps" (textual similarity ≥ 0.075 and a shared primary lifecycle stage) or "potentially
 * complements" (different primary stage, shared standards/repos/terms). They are never
 * presented as confirmed partnerships or duplicates.
 */
import type { Initiative, Milestone, Pledge } from "@/lib/domain/schemas";
import { buildTfIdf, cosine, sharedTerms } from "./similarity";

export const OVERLAP_METHOD_VERSION = "overlap@1";
export const OVERLAP_THRESHOLDS = { overlapSimilarity: 0.075, complementSimilarity: 0.06, minSignals: 2 } as const;

export interface PairSignals {
  a: string;
  b: string;
  similarity: number;
  sharedTerms: string[];
  sharedStages: string[];
  samePrimaryStage: boolean;
  sharedStandards: string[];
  sharedRepos: string[];
  sharedBackers: string[];
  sameOrganization: boolean;
  /** Either initiative's primary stage appears in the other's stages. */
  primaryStageShared: boolean;
}

export interface Hypothesis extends PairSignals {
  kind: "potentially_overlaps" | "potentially_complements";
  reasons: string[];
  questions: string[];
}

export function initiativeText(ini: Initiative, milestones: Milestone[]): string {
  const keep = ["why", "in_scope", "requirements", "deliverables", "details"];
  return [
    ini.title,
    ini.summary,
    ...ini.sections.filter((s) => keep.includes(s.key)).map((s) => s.markdown),
    // Milestone names only: acceptance criteria share process boilerplate ("checked by at least one outside reviewer").
    ...milestones.filter((m) => m.initiativeId === ini.id).map((m) => m.name),
  ].join("\n");
}

function repoKeys(ini: Initiative): Set<string> {
  const out = new Set<string>();
  for (const l of ini.textLinks) {
    const m = /^https?:\/\/github\.com\/([^/]+)\/([^/#?]+)/i.exec(l.url);
    if (m) out.add(`${m[1]}/${m[2]}`.toLowerCase());
  }
  return out;
}

export function pairSignals(initiatives: Initiative[], milestones: Milestone[], pledges: Pledge[]): PairSignals[] {
  const index = buildTfIdf(initiatives.map((i) => ({ id: i.id, text: initiativeText(i, milestones) })));
  const repos = new Map(initiatives.map((i) => [i.id, repoKeys(i)]));
  const backers = new Map<string, Set<string>>();
  for (const p of pledges) {
    if (!p.backerId || /anon/i.test(p.backerId)) continue;
    backers.set(p.initiativeId, new Set([...(backers.get(p.initiativeId) ?? []), p.backerId]));
  }
  const out: PairSignals[] = [];
  for (let x = 0; x < initiatives.length; x++) {
    for (let y = x + 1; y < initiatives.length; y++) {
      const a = initiatives[x] as Initiative;
      const b = initiatives[y] as Initiative;
      const va = index.vectors.get(a.id) as Map<string, number>;
      const vb = index.vectors.get(b.id) as Map<string, number>;
      const sa = new Set(a.stages.map((s) => s.stage));
      const sb = b.stages.map((s) => s.stage);
      const ra = repos.get(a.id) as Set<string>;
      const ba = backers.get(a.id) ?? new Set<string>();
      out.push({
        a: a.id,
        b: b.id,
        similarity: Math.round(cosine(va, vb) * 1000) / 1000,
        sharedTerms: sharedTerms(va, vb, 6),
        sharedStages: sb.filter((s) => sa.has(s)),
        samePrimaryStage: !!a.stages[0] && a.stages[0].stage === b.stages[0]?.stage,
        sharedStandards: b.standards.filter((s) => a.standards.includes(s)),
        sharedRepos: [...(repos.get(b.id) ?? [])].filter((r) => ra.has(r)),
        sharedBackers: [...(backers.get(b.id) ?? [])].filter((k) => ba.has(k)),
        sameOrganization: !!a.organizationId && a.organizationId === b.organizationId,
        primaryStageShared: (!!a.stages[0] && sb.includes(a.stages[0].stage)) || (!!b.stages[0] && sa.has(b.stages[0].stage)),
      });
    }
  }
  return out;
}

export function hypotheses(signals: PairSignals[], byId: Map<string, Initiative>): Hypothesis[] {
  const out: Hypothesis[] = [];
  for (const s of signals) {
    const reasons: string[] = [];
    if (s.similarity >= OVERLAP_THRESHOLDS.complementSimilarity) reasons.push(`Textual similarity ${s.similarity.toFixed(2)} (shared terms: ${s.sharedTerms.slice(0, 4).join(", ") || "—"})`);
    if (s.sharedStandards.length) reasons.push(`Both reference ${s.sharedStandards.join(", ")}`);
    if (s.sharedRepos.length) reasons.push(`Both cite ${s.sharedRepos.join(", ")}`);
    if (s.sharedStages.length) reasons.push(`Shared lifecycle stages: ${s.sharedStages.join(", ")}`);
    if (s.sharedBackers.length) reasons.push(`Shared public backers (${s.sharedBackers.length})`);
    if (s.sameOrganization) reasons.push("Same recipient organization");
    const strong = s.similarity >= OVERLAP_THRESHOLDS.overlapSimilarity;
    const signalCount = [s.similarity >= OVERLAP_THRESHOLDS.complementSimilarity, s.sharedStandards.length > 0, s.sharedRepos.length > 0, s.sharedStages.length > 0].filter(Boolean).length;
    if (!(strong || (signalCount >= OVERLAP_THRESHOLDS.minSignals && (s.sharedStandards.length > 0 || s.sharedRepos.length > 0 || s.similarity >= OVERLAP_THRESHOLDS.complementSimilarity)))) continue;
    const kind: Hypothesis["kind"] = strong && s.primaryStageShared ? "potentially_overlaps" : "potentially_complements";
    const a = byId.get(s.a);
    const b = byId.get(s.b);
    const questions =
      kind === "potentially_overlaps"
        ? [
            `Which deliverables of ${a?.shortTitle} and ${b?.shortTitle} would a user need both of, and which would substitute for each other?`,
            "Do the two teams plan to share data formats, standards or infrastructure?",
          ]
        : [`Could ${a?.shortTitle} consume or feed outputs of ${b?.shortTitle}? Is there a public interface that would allow it?`];
    out.push({ ...s, kind, reasons, questions });
  }
  return out.sort((x, y) => y.similarity - x.similarity);
}
