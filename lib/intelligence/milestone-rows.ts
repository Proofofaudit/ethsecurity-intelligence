import type { Dataset } from "@/lib/domain/schemas";
import type { XrayRow } from "@/components/research/milestones";
import { displayName } from "./service";

/** Criteria terms that point at outside parties. "at least" (a numeric target) is excluded on purpose. */
const THIRD_PARTY_EXCLUDE = new Set(["at least"]);

/** Every milestone of the cohort, alphabetical by initiative, then in milestone order. */
export function milestoneRows(d: Dataset): XrayRow[] {
  const byId = new Map(d.initiatives.map((i) => [i.id, i]));
  return d.milestones
    .map((m) => {
      const ini = byId.get(m.initiativeId);
      return {
        id: m.id,
        slug: ini?.slug ?? "",
        initiative: ini ? displayName(d, ini) : m.initiativeId,
        type: ini?.type ?? "grant",
        index: m.index,
        name: m.name,
        amountCents: m.amountCents,
        share: m.shareOfGoal,
        adoption: m.adoption,
        done: m.done,
        targetMonth: m.targetMonth,
        link: m.link,
        criteria: m.criteria,
        questions: m.questions.map((q) => q.question),
        thirdParty: m.dependencyTerms.filter((t) => !THIRD_PARTY_EXCLUDE.has(t)),
      } satisfies XrayRow;
    })
    .sort((a, b) => a.initiative.localeCompare(b.initiative) || a.index - b.index);
}
