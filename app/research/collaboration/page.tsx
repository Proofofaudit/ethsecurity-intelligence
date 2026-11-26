import type { Metadata } from "next";
import Link from "next/link";
import { Tag } from "@/components/ui/button";
import { Note, PageHead } from "@/components/ui/layout";
import { BANNER_HREF, COI_SHORT, isCoiOrganization } from "@/lib/disclosure";
import { STAGE_LABEL } from "@/lib/domain/taxonomy";
import type { LifecycleStage } from "@/lib/domain/schemas";
import { loadIntelligence } from "@/lib/intelligence/load";
import { OVERLAP_THRESHOLDS } from "@/lib/intelligence/overlap";
import { collaboration, displayName, findInitiative, pairDetails, type CollaborationItem } from "@/lib/intelligence/service";
import { cn } from "@/lib/util/cn";

export const metadata: Metadata = { title: "Collaboration discovery" };
export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Replaces stage ids with their labels in the "Shared lifecycle stages" reason only. */
function stageReason(r: string): string {
  const prefix = "Shared lifecycle stages: ";
  if (!r.startsWith(prefix)) return r;
  return prefix + r.slice(prefix.length).split(", ").map((s) => STAGE_LABEL[s as LifecycleStage] ?? s).join(", ");
}

const KIND_LABEL = { potentially_overlaps: "Potentially overlaps", potentially_complements: "Potentially complements" } as const;

export default async function CollaborationPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { dataset: d } = await loadIntelligence();
  const focus = one(sp.focus)
    .split(",")
    .map((x) => findInitiative(d, x.trim())?.id)
    .filter((x): x is string => !!x);
  const kind = one(sp.kind);
  const all = collaboration(d);
  const items = all.filter((c) => (!focus.length || focus.includes(c.a.id) || focus.includes(c.b.id)) && (!kind || c.kind === kind));
  const choices = d.initiatives.map((i) => ({ slug: i.slug, label: displayName(d, i) })).sort((a, b) => a.label.localeCompare(b.label));
  const pairs = focus.length >= 2 ? pairDetails(d, focus) : [];
  const byId = new Map(d.initiatives.map((i) => [i.id, i]));
  const name = (id: string) => {
    const i = byId.get(id);
    return i ? displayName(d, i) : id;
  };
  const org = (id: string) => d.organizations.find((o) => o.id === id)?.name ?? id;
  const includesPoa = (focus.length ? focus : d.initiatives.map((i) => i.id)).some((id) => isCoiOrganization(byId.get(id)?.organizationId));

  const groups = new Map<string, CollaborationItem[]>();
  for (const c of items) {
    const g = c.sharedCategory?.label ?? "Across different official categories";
    groups.set(g, [...(groups.get(g) ?? []), c]);
  }
  const sortedGroups = [...groups.entries()].sort((a, b) => (a[0].startsWith("Across") ? 1 : b[0].startsWith("Across") ? -1 : a[0].localeCompare(b[0])));
  const qs = (next: Record<string, string>) => {
    const p = new URLSearchParams({ ...(focus.length ? { focus: focus.map((id) => byId.get(id)?.slug ?? id).join(",") } : {}), ...(kind ? { kind } : {}), ...next });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    const s = p.toString();
    return s ? `/research/collaboration?${s}` : "/research/collaboration";
  };

  return (
    <div className="space-y-8">
      <PageHead
        eyebrow="Research · Collaboration discovery"
        title="Possible overlaps and complements between initiatives"
        lede={
          <p>
            Every item here is a research hypothesis produced by the same rules for every category: text similarity, shared lifecycle stages, shared standards, shared repositories and shared backers. None of it implies a partnership, a duplicate or an agreement. Each item lists its reasoning and the questions a reviewer could ask.
          </p>
        }
      />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-y border-rule py-3 text-sm">
        <nav aria-label="Kind" className="flex flex-wrap gap-x-4 gap-y-1">
          {[
            { v: "", l: `All (${all.length})` },
            { v: "potentially_overlaps", l: `Potential overlaps (${all.filter((c) => c.kind === "potentially_overlaps").length})` },
            { v: "potentially_complements", l: `Potential complements (${all.filter((c) => c.kind === "potentially_complements").length})` },
          ].map((o) => (
            <Link key={o.v} href={qs({ kind: o.v })} aria-current={kind === o.v ? "page" : undefined} className={cn("hover:text-accent", kind === o.v ? "font-semibold text-ink" : "text-ink-2")}>
              {o.l}
            </Link>
          ))}
        </nav>
        <span className="hidden h-4 w-px bg-rule-2 md:block" aria-hidden="true" />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <form action="/research/collaboration" className="flex flex-wrap items-center gap-2">
            {kind && <input type="hidden" name="kind" value={kind} />}
            <label className="flex items-center gap-1.5 text-xs text-ink-3">
              Focus on
              <select name="focus" defaultValue={focus.length === 1 ? (byId.get(focus[0]!)?.slug ?? "") : ""} className="h-7 max-w-[260px] rounded-xs border border-rule-2 bg-paper px-1.5 text-xs text-ink focus:border-ink focus:outline-none">
                <option value="">All initiatives</option>
                {choices.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="h-7 rounded-xs border border-rule-2 px-2 text-xs hover:border-ink-3">
              Apply
            </button>
          </form>
          {focus.length > 0 && (
            <Link href={qs({ focus: "" })} className="text-ink-3 hover:text-accent">
              Clear focus
            </Link>
          )}
        </div>
      </div>

      {focus.length > 0 && (
        <section className="border-t border-ink pt-3">
          <h2 className="text-md font-semibold">Focus: {focus.map(name).join(", ")}</h2>
          <p className="mt-1 text-xs text-ink-3">Hypotheses that involve at least one of these initiatives. Below, every pair inside the set is analyzed, including pairs that do not reach the hypothesis thresholds.</p>
        </section>
      )}

      {includesPoa && (
        <aside className="border-l-2 border-ink bg-paper-2 px-4 py-2.5 text-xs text-ink-2" aria-label="Conflict of interest">
          {COI_SHORT} Its pairs are produced by the same rules and thresholds as every other pair.{" "}
          <Link href={BANNER_HREF} className="link">
            Read the disclosure
          </Link>
          .
        </aside>
      )}

      {pairs.length > 0 && (
        <section aria-labelledby="pairs-h">
          <h2 id="pairs-h" className="border-t border-ink pt-3 text-md font-semibold">
            Every pair in the focus set
          </h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[900px] text-xs">
              <caption className="sr-only">Deterministic signals for each pair of focus initiatives.</caption>
              <thead>
                <tr className="border-b border-ink text-left text-2xs tracking-wide text-ink-3 uppercase">
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Pair
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Result
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">
                    Text similarity
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Shared standards
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Shared lifecycle stages
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Shared repositories
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Shared backers
                  </th>
                </tr>
              </thead>
              <tbody>
                {pairs
                  .sort((x, y) => y.similarity - x.similarity)
                  .map((p) => (
                    <tr key={`${p.a}-${p.b}`} className="border-b border-rule align-top">
                      <td className="py-2 pr-3">
                        <Link href={`/research/compare?ids=${byId.get(p.a)?.slug},${byId.get(p.b)?.slug}`} className="font-medium hover:text-accent">
                          {name(p.a)} and {name(p.b)}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">{p.hypothesis ? <Tag className="border-st-partial text-st-partial">{KIND_LABEL[p.hypothesis.type as keyof typeof KIND_LABEL]} · hypothesis</Tag> : <span className="text-ink-3">Below thresholds</span>}</td>
                      <td className="num py-2 pr-3 text-right">{p.similarity.toFixed(3)}</td>
                      <td className="py-2 pr-3">{p.sharedStandards.join(", ") || "None"}</td>
                      <td className="py-2 pr-3">{p.sharedStages.map((s) => STAGE_LABEL[s as LifecycleStage] ?? s).join(", ") || "None"}</td>
                      <td className="py-2 pr-3 break-all">{p.sharedRepos.join(", ") || "None"}</td>
                      <td className="py-2">{p.sharedBackers.map(org).join(", ") || "None"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <Note className="mt-2">Thresholds are described under Method and limits below.</Note>
        </section>
      )}

      {items.length === 0 ? (
        <p className="border-t border-rule pt-4 text-sm text-ink-3">No hypotheses match this selection.</p>
      ) : (
        sortedGroups.map(([g, list]) => (
          <section key={g} aria-label={g}>
            <h2 className="border-t border-ink pt-3 text-md font-semibold">
              {g} <span className="num text-sm font-normal text-ink-3">{list.length}</span>
            </h2>
            <ul className="mt-2 divide-y divide-rule">
              {list.map((c) => (
                <li key={c.relationship.id} className="grid gap-x-8 gap-y-2 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Tag className="border-st-partial text-st-partial">{KIND_LABEL[c.kind]} · research hypothesis</Tag>
                      {c.signals && <span className="num text-2xs text-ink-3">similarity {c.signals.similarity.toFixed(3)}</span>}
                    </div>
                    <p className="mt-1.5 text-sm">
                      <Link href={`/initiatives/${c.a.slug}#related`} className="font-medium hover:text-accent">
                        {name(c.a.id)}
                      </Link>{" "}
                      <span className="text-ink-3">and</span>{" "}
                      <Link href={`/initiatives/${c.b.slug}#related`} className="font-medium hover:text-accent">
                        {name(c.b.id)}
                      </Link>
                    </p>
                    <ul className="mt-2 space-y-0.5 text-xs text-ink-2">
                      {c.reasons.map((r) => (
                        <li key={r}>{stageReason(r)}</li>
                      ))}
                    </ul>
                    <p className="mt-2 flex flex-wrap gap-x-4 text-xs">
                      <Link href={`/research/compare?ids=${c.a.slug},${c.b.slug}`} className="link">
                        Compare side by side
                      </Link>
                      <Link href={`/research/graph?type=initiative&id=${c.a.id}`} className="text-ink-3 hover:text-accent">
                        Relationship map
                      </Link>
                      {c.signals?.sharedStandards.map((s) => (
                        <Link key={s} href={`/research/graph?type=standard&id=${s}`} className="text-ink-3 hover:text-accent">
                          {s}
                        </Link>
                      ))}
                      {c.signals?.sharedRepos.map((r) => (
                        <a key={r} href={`https://github.com/${r}`} target="_blank" rel="noopener noreferrer" className="text-ink-3 hover:text-accent">
                          github.com/{r}
                        </a>
                      ))}
                    </p>
                  </div>
                  <div className="min-w-0 border-l border-rule pl-4 max-lg:border-l-0 max-lg:pl-0">
                    <p className="eyebrow mb-1">Questions to investigate</p>
                    <ul className="list-disc space-y-1 pl-4 text-xs text-ink-2">
                      {c.questions.map((q) => (
                        <li key={q}>{q}</li>
                      ))}
                    </ul>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <section className="border-t border-ink pt-3">
        <h2 className="text-md font-semibold">Method and limits</h2>
        <div className="mt-2 max-w-[820px] space-y-2 text-sm text-ink-2">
          <p>
            Signals are computed for all {(d.initiatives.length * (d.initiatives.length - 1)) / 2} pairs in the cohort: TF-IDF cosine similarity over the title, summary, problem, scope and deliverable sections and milestone names; lifecycle stages from the coverage map; ERC, EIP and RIP numbers in the text; cited GitHub repositories; and named (non-anonymous) backers from official pledge records. Groups use the first official category both initiatives share.
          </p>
          <p>
            A pair becomes a hypothesis when text similarity is at least {OVERLAP_THRESHOLDS.overlapSimilarity}, or when at least {OVERLAP_THRESHOLDS.minSignals} of four signals are present (similarity of at least {OVERLAP_THRESHOLDS.complementSimilarity}, a shared standard, a shared repository, a shared lifecycle stage) and one of them is not a shared stage. It is labeled an overlap when similarity is at least {OVERLAP_THRESHOLDS.overlapSimilarity} and one initiative&apos;s primary stage appears among the other&apos;s stages, and a complement otherwise. Shared backers are listed but do not count toward the thresholds.
          </p>
          <p>Shared beneficiaries and integration opportunities are not scored automatically. They are left to the questions above, because the proposal text alone cannot establish them.</p>
          <p>The truth audit recomputes these hypotheses from the published dataset before every publication and blocks publication if the result differs.</p>
        </div>
      </section>
    </div>
  );
}
