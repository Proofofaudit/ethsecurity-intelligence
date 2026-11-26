"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { AddPicker, Check, inputClass } from "@/components/ui/form";
import { Money } from "@/components/ui/money";
import { useWorkspace } from "@/components/workspace/store";
import type { simulatePortfolio } from "@/lib/intelligence/service";
import { cn } from "@/lib/util/cn";

type Result = ReturnType<typeof simulatePortfolio>;

export interface LabInitiative {
  id: string;
  slug: string;
  label: string;
  sub: string | null;
  standards: string[];
}

const num = (s: string) => {
  const v = Number(s.replace(/[,\s$]/g, ""));
  return s.trim() === "" || !Number.isFinite(v) || v < 0 ? undefined : v;
};

export function WhatIfLab({ initiatives, hypotheses, initial }: { initiatives: LabInitiative[]; hypotheses: { id: string; a: string; b: string; kind: string }[]; initial: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const w = useWorkspace();
  const [ids, setIds] = useState<string[]>(initial);
  const [budget, setBudget] = useState("");
  const [conversion, setConversion] = useState(100);
  const [excludeAdoption, setExcludeAdoption] = useState(false);
  const [adoptionDelay, setAdoptionDelay] = useState(0);
  const [milestoneDelay, setMilestoneDelay] = useState(0);
  const [plannedOff, setPlannedOff] = useState(false);
  const [unconfirmedOff, setUnconfirmedOff] = useState(false);
  const [standardsOff, setStandardsOff] = useState<string[]>([]);
  const [assumed, setAssumed] = useState<string[]>([]);
  const [extra, setExtra] = useState<Record<string, string>>({});
  const [rawResult, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const bySlug = useMemo(() => new Map(initiatives.map((i) => [i.slug, i])), [initiatives]);
  const byId = useMemo(() => new Map(initiatives.map((i) => [i.id, i])), [initiatives]);
  const chosen = useMemo(() => ids.map((s) => bySlug.get(s)).filter((x): x is LabInitiative => !!x), [ids, bySlug]);
  const standards = useMemo(() => [...new Set(chosen.flatMap((i) => i.standards))].sort(), [chosen]);
  const pairHyps = useMemo(() => hypotheses.filter((h) => ids.includes(h.a) && ids.includes(h.b)), [hypotheses, ids]);

  useEffect(() => {
    const qs = ids.length ? `?ids=${ids.join(",")}` : "";
    router.replace(`${pathname}${qs}`, { scroll: false });
  }, [ids, pathname, router]);

  const body = useMemo(() => {
    if (!ids.length) return null;
    const extraUsd: Record<string, number> = {};
    for (const [slug, v] of Object.entries(extra)) {
      const n = num(v);
      if (n && ids.includes(slug)) extraUsd[slug] = n;
    }
    return {
      initiativeIds: ids,
      budgetUsd: num(budget),
      pledgeConversion: conversion / 100,
      excludeAdoptionMilestones: excludeAdoption,
      adoptionDelayMonths: adoptionDelay,
      milestoneDelayMonths: milestoneDelay,
      treatPlannedIntegrationsAsUnavailable: plannedOff,
      treatUnconfirmedIntegrationsAsUnavailable: unconfirmedOff,
      unavailableStandards: standardsOff.filter((s) => standards.includes(s)),
      assumedCollaborations: assumed.filter((c) => pairHyps.some((h) => h.id === c)),
      extraFundingUsd: extraUsd,
    };
  }, [ids, budget, conversion, excludeAdoption, adoptionDelay, milestoneDelay, plannedOff, unconfirmedOff, standardsOff, assumed, extra, standards, pairHyps]);

  useEffect(() => {
    if (!body) return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/v1/simulate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
        setResult(json.data as Result);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError(e instanceof Error ? e.message : "The scenario could not be computed.");
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [body]);

  const move = (slug: string, dir: -1 | 1) =>
    setIds((list) => {
      const i = list.indexOf(slug);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return list;
      const n = [...list];
      [n[i], n[j]] = [n[j]!, n[i]!];
      return n;
    });
  const reset = () => {
    setBudget("");
    setConversion(100);
    setExcludeAdoption(false);
    setAdoptionDelay(0);
    setMilestoneDelay(0);
    setPlannedOff(false);
    setUnconfirmedOff(false);
    setStandardsOff([]);
    setAssumed([]);
    setExtra({});
  };

  const result = body ? rawResult : null;
  const alloc = new Map((result?.allocation ?? []).map((a) => [a.id, a]));
  const active = (result?.assumptions ?? []).filter((a) => a.active);
  const affectedIds = new Set(active.flatMap((a) => a.affected));
  const savedAffected = w.assessments.filter((a) => affectedIds.has(a.initiativeId));

  return (
    <div className="space-y-6">
      <div role="note" className="sticky top-0 z-20 border-y border-st-partial bg-st-partial-wash px-3 py-1.5 text-xs font-medium text-ink">
        Exploration only, not a prediction. Figures follow from your assumptions and the published records.
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <form className="space-y-5 text-sm" onSubmit={(e) => e.preventDefault()} aria-label="Assumptions">
          <fieldset>
            <legend className="eyebrow mb-1.5">Initiatives, in budget order</legend>
            <AddPicker
              options={initiatives.map((i) => ({ id: i.slug, label: i.label, sub: i.sub }))}
              selected={ids}
              max={55}
              onAdd={(s) => setIds((l) => [...l, s])}
              placeholder="Add an initiative by name"
              label="Add an initiative to the scenario"
            />
            {w.initiatives.length > 0 && (
              <button
                type="button"
                className="mt-1.5 text-xs text-ink-3 hover:text-accent"
                onClick={() => setIds((l) => [...new Set([...l, ...w.initiatives.map((x) => byId.get(x.id)?.slug).filter((s): s is string => !!s)])])}
              >
                Add my {w.initiatives.length} saved {w.initiatives.length === 1 ? "initiative" : "initiatives"}
              </button>
            )}
            <ol className="mt-2 divide-y divide-rule border-y border-rule">
              {chosen.map((i, idx) => (
                <li key={i.slug} className="flex items-center gap-2 py-1.5 text-xs">
                  <span className="num w-5 text-ink-3">{idx + 1}</span>
                  <span className="min-w-0 flex-1 truncate" title={i.label}>
                    {i.label}
                  </span>
                  <button type="button" onClick={() => move(i.slug, -1)} disabled={idx === 0} className="px-1 text-ink-3 hover:text-accent disabled:opacity-30" aria-label={`Move ${i.label} up`}>
                    ↑
                  </button>
                  <button type="button" onClick={() => move(i.slug, 1)} disabled={idx === chosen.length - 1} className="px-1 text-ink-3 hover:text-accent disabled:opacity-30" aria-label={`Move ${i.label} down`}>
                    ↓
                  </button>
                  <button type="button" onClick={() => setIds((l) => l.filter((s) => s !== i.slug))} className="px-1 text-ink-3 hover:text-accent" aria-label={`Remove ${i.label}`}>
                    ✕
                  </button>
                </li>
              ))}
              {chosen.length === 0 && <li className="py-2 text-xs text-ink-3">No initiative selected yet.</li>}
            </ol>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="eyebrow mb-1.5">Funding</legend>
            <label className="block">
              <span className="mb-1 block text-xs text-ink-3">Budget to allocate (USD, optional)</span>
              <input inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="For example 500000" className={inputClass} />
            </label>
            <label className="block">
              <span className="mb-1 flex justify-between text-xs text-ink-3">
                <span>Outstanding pledges that convert to funds</span>
                <span className="num text-ink">{conversion}%</span>
              </span>
              <input type="range" min={0} max={100} step={5} value={conversion} onChange={(e) => setConversion(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
            </label>
            {chosen.length > 0 && (
              <details>
                <summary className="text-xs text-ink-2 hover:text-accent">Alternative funding per initiative</summary>
                <div className="mt-2 space-y-1.5">
                  {chosen.map((i) => (
                    <label key={i.slug} className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-2 text-xs">
                      <span className="truncate">{i.label}</span>
                      <input inputMode="decimal" placeholder="USD" value={extra[i.slug] ?? ""} onChange={(e) => setExtra((x) => ({ ...x, [i.slug]: e.target.value }))} className={inputClass} aria-label={`Alternative funding for ${i.label} in US dollars`} />
                    </label>
                  ))}
                </div>
              </details>
            )}
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="eyebrow mb-1.5">Delivery</legend>
            <Check checked={excludeAdoption} onChange={setExcludeAdoption}>
              Exclude open adoption milestones from scope
            </Check>
            <label className="block">
              <span className="mb-1 flex justify-between text-xs text-ink-3">
                <span>Adoption delay</span>
                <span className="num text-ink">{adoptionDelay} months</span>
              </span>
              <input type="range" min={0} max={24} value={adoptionDelay} onChange={(e) => setAdoptionDelay(Number(e.target.value))} className="w-full accent-[var(--accent)]" disabled={excludeAdoption} />
            </label>
            <label className="block">
              <span className="mb-1 flex justify-between text-xs text-ink-3">
                <span>Delay on every milestone</span>
                <span className="num text-ink">{milestoneDelay} months</span>
              </span>
              <input type="range" min={0} max={24} value={milestoneDelay} onChange={(e) => setMilestoneDelay(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
            </label>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="eyebrow mb-1.5">Dependencies</legend>
            <Check checked={unconfirmedOff} onChange={setUnconfirmedOff}>
              Integrations stated by the applicant are not available
            </Check>
            <Check checked={plannedOff} onChange={setPlannedOff}>
              Planned integrations are not available
            </Check>
            {standards.length > 0 ? (
              <div>
                <p className="mb-1 text-xs text-ink-3">Standards these initiatives depend on, assumed unavailable:</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {standards.map((s) => (
                    <Check key={s} checked={standardsOff.includes(s)} onChange={(on) => setStandardsOff((l) => (on ? [...l, s] : l.filter((x) => x !== s)))} className="text-xs">
                      {s}
                    </Check>
                  ))}
                </div>
              </div>
            ) : (
              chosen.length > 0 && <p className="text-xs text-ink-3">No selected initiative states a dependency on a specific standard.</p>
            )}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="eyebrow mb-1.5">Collaboration</legend>
            {pairHyps.length ? (
              pairHyps.map((h) => (
                <Check key={h.id} checked={assumed.includes(h.id)} onChange={(on) => setAssumed((l) => (on ? [...l, h.id] : l.filter((x) => x !== h.id)))} className="text-xs">
                  {bySlug.get(h.a)?.label} and {bySlug.get(h.b)?.label} collaborate <span className="text-ink-3">({h.kind === "potentially_overlaps" ? "overlap" : "complement"} hypothesis)</span>
                </Check>
              ))
            ) : (
              <p className="text-xs text-ink-3">{chosen.length < 2 ? "Add two or more initiatives to see collaboration hypotheses between them." : "No overlap or complement hypothesis links the selected initiatives."}</p>
            )}
          </fieldset>

          <Button variant="ghost" size="sm" onClick={reset}>
            Reset assumptions
          </Button>
        </form>

        <div className="min-w-0 space-y-6" aria-live="polite">
          {error && (
            <p role="alert" className="text-sm text-st-contradicted">
              {error}
            </p>
          )}
          {!result ? (
            <p className="border-t border-rule pt-4 text-sm text-ink-3">{loading ? "Computing…" : "Add at least one initiative to compute a scenario."}</p>
          ) : (
            <>
              <dl className={cn("grid grid-cols-2 gap-px border-y border-ink bg-rule sm:grid-cols-4 [&>div]:bg-paper [&>div]:px-3 [&>div]:py-3", loading && "opacity-60")}>
                <div>
                  <dt className="text-xs text-ink-3">Scope</dt>
                  <dd className="mt-1 text-lg">
                    <Money cents={result.totals.scopeCents} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-3">Secured under assumptions</dt>
                  <dd className="mt-1 text-lg">
                    <Money cents={result.totals.securedCents} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-3">Remaining gap</dt>
                  <dd className="mt-1 text-lg">
                    <Money cents={result.totals.gapCents} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-3">Budget left</dt>
                  <dd className="mt-1 text-lg">{result.totals.budgetLeftCents === null ? <span className="text-sm text-ink-3">No budget entered</span> : <Money cents={result.totals.budgetLeftCents} />}</dd>
                </div>
              </dl>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <caption className="sr-only">Scenario result per initiative</caption>
                  <thead>
                    <tr className="border-b border-ink text-left text-2xs tracking-wide text-ink-3 uppercase">
                      <th scope="col" className="py-2 pr-3 font-medium">
                        Initiative
                      </th>
                      <th scope="col" className="py-2 pr-3 text-right font-medium">
                        Scope
                      </th>
                      <th scope="col" className="py-2 pr-3 text-right font-medium">
                        Secured
                      </th>
                      <th scope="col" className="py-2 pr-3 text-right font-medium">
                        Gap
                      </th>
                      <th scope="col" className="py-2 pr-3 text-right font-medium">
                        Budget applied
                      </th>
                      <th scope="col" className="py-2 pr-3 text-right font-medium">
                        Duration
                      </th>
                      <th scope="col" className="py-2 font-medium">
                        Depends on
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((r) => {
                      const a = alloc.get(r.id);
                      return (
                        <tr key={r.id} className="border-b border-rule align-top">
                          <td className="py-2 pr-3">
                            <Link href={`/initiatives/${r.slug}`} className="font-medium hover:text-accent">
                              {byId.get(r.id)?.label ?? r.shortTitle}
                            </Link>
                          </td>
                          <td className="py-2 pr-3 text-right">
                            <Money cents={r.scopeCents} />
                          </td>
                          <td className="py-2 pr-3 text-right">
                            <Money cents={r.securedCents} />
                          </td>
                          <td className="py-2 pr-3 text-right">
                            <Money cents={r.gapCents} />
                          </td>
                          <td className="py-2 pr-3 text-right">{a?.allocatedCents === null || !a ? <span className="text-ink-3">–</span> : <Money cents={a.allocatedCents} />}</td>
                          <td className="num py-2 pr-3 text-right text-xs whitespace-nowrap">
                            {r.durationMonths === null ? <span className="font-sans text-ink-3">Not stated</span> : r.adjustedMonths !== r.durationMonths ? `${r.durationMonths} → ${r.adjustedMonths} mo` : `${r.durationMonths} mo`}
                          </td>
                          <td className="py-2 text-xs text-ink-2">
                            {r.dependsOn.length ? (
                              <ul className="space-y-0.5">
                                {r.dependsOn.map((x) => (
                                  <li key={x}>{x}</li>
                                ))}
                              </ul>
                            ) : (
                              <span className="text-ink-3">No recorded dependency</span>
                            )}
                            {r.affectedMilestones.length > 0 && <p className="mt-1 text-ink-3">Milestones whose criteria mention integration: {r.affectedMilestones.join("; ")}</p>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <section>
                <h2 className="border-t border-ink pt-3 text-md font-semibold">Which results depend on each assumption</h2>
                <ul className="mt-2 divide-y divide-rule text-sm">
                  {result.assumptions.map((a) => (
                    <li key={a.key} className="grid gap-x-4 gap-y-0.5 py-1.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                      <span className={a.active ? "font-medium" : "text-ink-3"}>
                        {a.label}
                        {!a.active && <span className="text-2xs"> · not applied</span>}
                      </span>
                      <span className="text-xs text-ink-2">{a.affected.length ? `${a.active ? "Affects" : "Would affect"}: ${a.affected.map((id) => byId.get(id)?.label ?? id).join(", ")}` : <span className="text-ink-3">No selected initiative is affected</span>}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h2 className="border-t border-ink pt-3 text-md font-semibold">Your saved assessments that depend on active assumptions</h2>
                {savedAffected.length ? (
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {savedAffected.map((s) => (
                      <li key={s.id}>
                        <span className="font-medium">{byId.get(s.initiativeId)?.label}</span>: <span className="text-ink-2">{s.text.length > 160 ? `${s.text.slice(0, 159)}…` : s.text}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-ink-3">
                    None. Assessments you record in{" "}
                    <Link href="/workspace" className="link">
                      My Workspace
                    </Link>{" "}
                    are listed here when an active assumption affects their initiative.
                  </p>
                )}
              </section>
              <p className="text-xs text-ink-3">{result.disclaimer}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
