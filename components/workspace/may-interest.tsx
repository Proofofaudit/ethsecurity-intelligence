"use client";

import Link from "next/link";
import { useId, useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/form";
import { ArrowUpRight } from "@/components/ui/icons";
import { SourceLabel } from "@/components/ui/official-quote";
import { NEUTRAL_SORT_LABEL } from "@/lib/neutralLanguage";
import { cn } from "@/lib/util/cn";
import type { AffiliationTarget, SharedGroup } from "@/lib/vote/affiliation";
import { PUBLIC_SUGGESTION_LABEL } from "@/lib/vote/badge-directory";
import { mayInterest, REASON_FIELD_LABEL, type FocusId } from "@/lib/vote/interest";
import type { InterestView } from "@/lib/vote/view-data";
import { AffiliationTag, SharedGroupLine, useAffiliationFlags } from "./affiliations";
import { addInterestKeyword, removeInterestKeyword, toggleFocus, useWorkspace } from "./store";

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={cn("h-6 rounded-xs border px-1.5 text-xs", on ? "border-ink bg-ink text-paper" : "border-rule-2 text-ink-2 hover:border-ink-3")} data-focus-chip={children}>
      {children}
    </button>
  );
}

export function MayInterest({ view, targets, shared }: { view: InterestView; targets: AffiliationTarget[]; shared: Record<string, SharedGroup[]> }) {
  const w = useWorkspace();
  const flags = useAffiliationFlags(targets);
  const [q, setQ] = useState("");
  const id = useId();
  const focus = w.interest.focus as FocusId[];
  const groups = useMemo(() => mayInterest(view.initiatives, focus, w.interest.keywords, view.chips), [view, focus, w.interest.keywords]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    addInterestKeyword(q);
    setQ("");
  };
  const cats = view.chips.filter((c) => c.kind === "category");
  const modes = view.chips.filter((c) => c.kind === "mode");

  return (
    <section id="may-interest" aria-labelledby="may-interest-h" data-may-interest className="scroll-mt-20 border-t border-ink pt-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="may-interest-h" className="text-md font-semibold">
          May interest you
        </h2>
        <p className="text-xs text-ink-3">Built in this browser from your focus. No ranking, score or advice.</p>
      </div>
      <p className="mb-3 max-w-[820px] text-xs text-ink-3">
        Pick focus chips or type keywords to get a starting set from the {view.initiatives.length} initiatives. Each item says why it matched and links to evidence. Groups follow the order of the chips; inside each group the order is {NEUTRAL_SORT_LABEL}. Research modes map to categories and keywords as listed on the{" "}
        <Link href="/about#interest" className="link">
          Methodology page
        </Link>
        .
      </p>

      <p className="mb-3 text-xs">
        <Link href="/workspace/briefing" className="link" data-briefing-chain-link>
          Briefing for all in my focus
        </Link>
      </p>

      <div className="space-y-3">
        <div>
          <p className="eyebrow mb-1">Official categories</p>
          <div className="flex flex-wrap gap-1.5">
            {cats.map((c) => (
              <Chip key={c.id} on={focus.includes(c.id)} onClick={() => toggleFocus(c.id)}>
                {c.label}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <p className="eyebrow mb-1">AI Lab research modes</p>
          <div className="flex flex-wrap gap-1.5">
            {modes.map((c) => (
              <Chip key={c.id} on={focus.includes(c.id)} onClick={() => toggleFocus(c.id)}>
                {c.label}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <p className="eyebrow mb-1">Keywords</p>
          <form onSubmit={submit} className="flex max-w-[520px] gap-2">
            <label htmlFor={id} className="sr-only">
              Add a keyword
            </label>
            <input id={id} value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. clear signing, fuzzing, EIP-7702" className={inputClass} autoComplete="off" data-interest-keyword-input />
            <Button size="sm" type="submit" disabled={q.trim().length < 2}>
              Add
            </Button>
          </form>
          {w.interest.keywords.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Your keywords">
              {w.interest.keywords.map((k) => (
                <li key={k} className="inline-flex items-center gap-1 rounded-xs border border-rule-2 px-1.5 py-px text-xs">
                  {k}
                  <button type="button" onClick={() => removeInterestKeyword(k)} className="text-ink-3 hover:text-accent" aria-label={`Remove keyword ${k}`}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          {w.interest.suggested && w.interest.keywords.length > 0 && <p className="mt-1 text-xs text-st-partial">{PUBLIC_SUGGESTION_LABEL}</p>}
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="mt-4 text-sm text-ink-3">Pick a focus or add a keyword to see initiatives that match it.</p>
      ) : (
        <div className="mt-5 space-y-6">
          {groups.map((g) => (
            <div key={g.key} data-interest-group={g.key}>
              <h3 className="eyebrow mb-1">
                {g.label} <span className="num">{g.items.length}</span>
              </h3>
              {g.items.length === 0 ? (
                <p className="text-sm text-ink-3">No initiative matches this focus.</p>
              ) : (
                <ul className="divide-y divide-rule border-y border-rule">
                  {g.items.map((i) => (
                    <li key={i.id} className="py-2 text-sm" data-interest-item={i.slug}>
                      <Link href={`/initiatives/${i.slug}`} className="font-medium hover:text-accent">
                        {i.label}
                      </Link>
                      {i.reasons.map((r, n) => (
                        <div key={n} className="mt-0.5 text-xs" data-interest-reason>
                          <p className="text-ink-2">{r.text}</p>
                          <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-ink-3">
                            <SourceLabel kind={r.field === "category" ? "official" : "applicant"} />
                            <span>
                              {REASON_FIELD_LABEL[r.field].charAt(0).toUpperCase() + REASON_FIELD_LABEL[r.field].slice(1)}: {r.field === "category" ? r.matched : <q>{r.matched}</q>}
                            </span>
                          </p>
                        </div>
                      ))}
                      <SharedGroupLine groups={shared[i.id]} className="mt-0.5" />
                      <AffiliationTag flag={flags.get(i.id)} className="mt-1 flex" />
                      <p className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
                        {i.links.map((l) =>
                          l.kind === "dossier" ? (
                            <Link key={l.href} href={l.href} className="text-ink-3 hover:text-accent">
                              {l.label}
                            </Link>
                          ) : (
                            <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-ink-2 hover:text-accent" data-evidence-link={l.kind}>
                              {l.label}
                              <ArrowUpRight />
                              <span className="sr-only"> (opens in a new tab)</span>
                            </a>
                          ),
                        )}
                        {!i.links.some((l) => l.kind === "evidence") && <span className="text-ink-3">Not yet verified: no statement has independent evidence yet.</span>}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
