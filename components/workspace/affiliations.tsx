"use client";

import Link from "next/link";
import { useId, useMemo, useState, type FormEvent } from "react";
import { Button, Tag } from "@/components/ui/button";
import { AddPicker, inputClass } from "@/components/ui/form";
import { cn } from "@/lib/util/cn";
import {
  AFFILIATED_WITH,
  affiliationFlag,
  isFlagged,
  MARKED_AFFILIATED,
  matchAffiliations,
  matchText,
  MAY_BE_AFFILIATED,
  peersOf,
  type AffiliationFlag,
  type AffiliationTarget,
  type SharedGroup,
} from "@/lib/vote/affiliation";
import { BADGE_DIRECTORY, DIRECTORY_UNAVAILABLE_NOTE, PUBLIC_SUGGESTION_LABEL, searchDirectory } from "@/lib/vote/badge-directory";
import type { AffiliationView } from "@/lib/vote/view-data";
import { addAffiliation, applyPublicSuggestion, removeAffiliation, setAffiliationMark, useWorkspace } from "./store";

/** Initiative id → the holder's affiliation flag, computed in the browser from local entries. */
export function useAffiliationFlags(targets: readonly AffiliationTarget[]): Map<string, AffiliationFlag> {
  const w = useWorkspace();
  return useMemo(() => {
    const matches = matchAffiliations(w.affiliations.entries, targets);
    const ids = new Set([...Object.keys(matches), ...Object.keys(w.affiliations.overrides)]);
    return new Map([...ids].map((id) => [id, affiliationFlag(id, matches, w.affiliations.overrides)]));
  }, [w.affiliations, targets]);
}

const amber = "border-st-partial bg-st-partial-wash text-st-partial";

/** Amber tag with the matched text. Renders nothing when the initiative is not flagged. */
export function AffiliationTag({ flag, label, className }: { flag: AffiliationFlag | undefined; label?: string; className?: string }) {
  if (!flag || !isFlagged(flag)) return null;
  const detail = flag.kind === "matched" ? matchText(flag.matches) : "Marked by you in My affiliations.";
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-1.5 text-xs", className)} data-affiliation-flag={flag.kind}>
      <Tag className={amber}>{label ?? (flag.kind === "marked" ? MARKED_AFFILIATED : MAY_BE_AFFILIATED)}</Tag>
      <span className="text-ink-2">{detail}</span>
    </span>
  );
}

/** "Affiliated with: …" from the official manifest groups. */
export function SharedGroupLine({ groups, className }: { groups: readonly SharedGroup[] | undefined; className?: string }) {
  if (!groups?.length) return null;
  return (
    <span className={cn("block text-xs text-ink-2", className)} data-affiliated-with>
      {AFFILIATED_WITH}{" "}
      {peersOf(groups).map((p, n) => (
        <span key={p.id}>
          {n > 0 && ", "}
          <Link href={`/initiatives/${p.slug}`} className="hover:text-accent">
            {p.label}
          </Link>
        </span>
      ))}{" "}
      <span className="text-ink-3">(manifest {groups.length === 1 ? "group" : "groups"} {groups.map((g) => `“${g.group}”`).join(", ")})</span>
    </span>
  );
}

/** Dossier header tag: reads the local workspace, so it renders only in the browser. */
export function DossierAffiliationTag({ id, targets }: { id: string; targets: AffiliationTarget[] }) {
  const flags = useAffiliationFlags(targets);
  return <AffiliationTag flag={flags.get(id)} className="mt-2" />;
}

function EntryInput({ suggestions }: { suggestions: readonly string[] }) {
  const [q, setQ] = useState("");
  const id = useId();
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t.length < 1 ? [] : suggestions.filter((s) => s.toLowerCase().includes(t)).slice(0, 8);
  }, [q, suggestions]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    addAffiliation(q);
    setQ("");
  };
  return (
    <form onSubmit={submit} className="flex max-w-[520px] gap-2">
      <label htmlFor={id} className="sr-only">
        Add an organization you work with, advise or founded
      </label>
      <input id={id} list={`${id}-list`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Organization, e.g. an audit firm you work with" className={inputClass} autoComplete="off" data-affiliation-input />
      <datalist id={`${id}-list`}>
        {hits.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <Button size="sm" type="submit" disabled={!q.trim()}>
        Add
      </Button>
    </form>
  );
}

function PublicProfile() {
  const [q, setQ] = useState("");
  const id = useId();
  const enabled = BADGE_DIRECTORY.length > 0;
  const hits = enabled ? searchDirectory(BADGE_DIRECTORY, q) : [];
  return (
    <div data-public-profile data-enabled={String(enabled)}>
      <p className="eyebrow mb-1">Find my public profile</p>
      <div className="flex max-w-[520px] gap-2">
        <label htmlFor={id} className="sr-only">
          Search the public badge-holder list
        </label>
        <input id={id} type="search" value={q} onChange={(e) => setQ(e.target.value)} disabled={!enabled} placeholder="Handle or expertise, e.g. DeFi auditor" className={inputClass} autoComplete="off" data-public-profile-input />
      </div>
      {!enabled && (
        <p className="mt-1 max-w-[720px] text-xs text-ink-3" data-public-profile-note>
          {DIRECTORY_UNAVAILABLE_NOTE}
        </p>
      )}
      {hits.length > 0 && (
        <ul className="mt-2 divide-y divide-rule border-y border-rule">
          {hits.map((h) => (
            <li key={h.handle} className="flex flex-wrap items-baseline justify-between gap-2 py-1.5 text-sm">
              <span>
                <span className="font-medium">{h.handle}</span> <span className="text-xs text-ink-3">{[...h.organizations, ...h.expertise].join(" · ")}</span>
              </span>
              <Button size="sm" onClick={() => applyPublicSuggestion(h.organizations, h.expertise)}>
                This is me
              </Button>
            </li>
          ))}
        </ul>
      )}
      {enabled && <p className="mt-1 text-xs text-ink-3">The search runs on a list bundled with this page; nothing is sent.</p>}
    </div>
  );
}

export function AffiliationsSection({ view, initiatives }: { view: AffiliationView; initiatives: { id: string; slug: string; label: string; sub: string | null }[] }) {
  const w = useWorkspace();
  const flags = useAffiliationFlags(view.targets);
  const byId = useMemo(() => new Map(initiatives.map((i) => [i.id, i])), [initiatives]);
  const groupChips = useMemo(() => [...new Set(view.targets.filter((t) => t.field === "group").map((t) => t.text))].sort((a, b) => a.localeCompare(b)), [view.targets]);
  const flagged = initiatives.filter((i) => flags.get(i.id));
  const sharedGroups = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const [id, gs] of Object.entries(view.shared)) for (const g of gs) m.set(g.group, [...(m.get(g.group) ?? []), id]);
    return [...m].sort((a, b) => a[0].localeCompare(b[0]));
  }, [view.shared]);

  return (
    <section id="affiliations" aria-labelledby="affiliations-h" data-affiliations className="scroll-mt-20 border-t border-ink pt-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="affiliations-h" className="text-md font-semibold">
          My affiliations <span className="num text-sm font-normal text-ink-3">{w.affiliations.entries.length}</span>
        </h2>
        <p className="text-xs text-ink-3">Stored in this browser only. Nothing is hidden because of a match.</p>
      </div>
      <p className="mb-3 max-w-[820px] text-xs text-ink-3">
        List organizations you work with, advise or founded. They are compared with each initiative&apos;s affiliation groups in the official vote manifest, its official recipient team and the published organization aliases, so a possible conflict is visible wherever the initiative appears in this workspace and on its dossier. Generic words such as Labs, Foundation, Security or Protocol never match on their own. You can mark or unmark any initiative by hand.
      </p>

      <div className="grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] [&>*]:min-w-0">
        <div className="space-y-4">
          <EntryInput suggestions={view.suggestions} />
          {w.affiliations.suggested && w.affiliations.entries.length > 0 && <p className="text-xs text-st-partial">{PUBLIC_SUGGESTION_LABEL}</p>}
          {w.affiliations.entries.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5" aria-label="Your affiliations">
              {w.affiliations.entries.map((e) => (
                <li key={e} className="inline-flex items-center gap-1 rounded-xs border border-rule-2 px-1.5 py-px text-xs" data-affiliation-entry={e}>
                  {e}
                  <button type="button" onClick={() => removeAffiliation(e)} className="text-ink-3 hover:text-accent" aria-label={`Remove ${e}`}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-3">No affiliations listed. Type an organization or pick a manifest group below.</p>
          )}
          {groupChips.length > 0 ? (
            <div>
              <p className="eyebrow mb-1">Manifest affiliation groups</p>
              <div className="flex flex-wrap gap-1.5">
                {groupChips.map((g) => {
                  const on = w.affiliations.entries.some((e) => e.toLowerCase() === g.toLowerCase());
                  return (
                    <button key={g} type="button" aria-pressed={on} onClick={() => (on ? removeAffiliation(w.affiliations.entries.find((e) => e.toLowerCase() === g.toLowerCase())!) : addAffiliation(g))} className={cn("h-6 rounded-xs border px-1.5 text-xs", on ? "border-ink bg-ink text-paper" : "border-rule-2 text-ink-2 hover:border-ink-3")}>
                      {g}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="border-l-2 border-st-partial pl-3 text-xs text-ink-2" data-groups-off>
              {view.groupsOffReason}
            </p>
          )}
          <PublicProfile />
        </div>

        <div className="space-y-4">
          <div>
            <p className="eyebrow mb-1">
              Possible affiliations <span className="num">{flagged.filter((i) => isFlagged(flags.get(i.id) ?? null)).length}</span> · Alphabetical (neutral)
            </p>
            {flagged.length === 0 ? (
              <p className="text-sm text-ink-3">No initiative matches your entries.</p>
            ) : (
              <ul className="divide-y divide-rule border-y border-rule">
                {flagged.map((i) => {
                  const f = flags.get(i.id) ?? null;
                  return (
                    <li key={i.id} className="grid gap-x-4 gap-y-1 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_auto]" data-affiliation-item={i.slug} data-state={f?.kind ?? "none"}>
                      <div className="min-w-0">
                        <Link href={`/initiatives/${i.slug}`} className="font-medium hover:text-accent">
                          {i.label}
                        </Link>
                        <AffiliationTag flag={f} className="mt-0.5 flex" />
                        {f?.kind === "dismissed" && <span className="block text-xs text-ink-3">You marked this as not affiliated ({matchText(f.matches)}).</span>}
                      </div>
                      <div className="flex gap-2 self-start">
                        {f?.kind === "matched" && (
                          <button type="button" className="text-xs text-ink-3 hover:text-accent" onClick={() => setAffiliationMark(i.id, "not_mine")}>
                            Not affiliated
                          </button>
                        )}
                        {(f?.kind === "dismissed" || f?.kind === "marked") && (
                          <button type="button" className="text-xs text-ink-3 hover:text-accent" onClick={() => setAffiliationMark(i.id, null)}>
                            {f.kind === "marked" ? "Remove mark" : "Undo"}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="mt-3 max-w-[420px]">
              <AddPicker
                options={initiatives}
                selected={Object.entries(w.affiliations.overrides)
                  .filter(([, v]) => v === "mine")
                  .map(([k]) => k)}
                max={200}
                onAdd={(id) => setAffiliationMark(id, "mine")}
                placeholder="Mark an initiative as affiliated by name"
                label="Mark an initiative as affiliated"
              />
            </div>
          </div>

          <div>
            <p className="eyebrow mb-1">Official groups shared by more than one initiative</p>
            {view.groupsOffReason ? (
              <p className="text-xs text-ink-3">{view.groupsOffReason}</p>
            ) : sharedGroups.length === 0 ? (
              <p className="text-xs text-ink-3">No manifest group is shared by two or more initiatives.</p>
            ) : (
              <ul className="space-y-1 text-xs text-ink-2" data-shared-groups>
                {sharedGroups.map(([g, ids]) => (
                  <li key={g}>
                    <span className="font-medium text-ink">{g}</span>:{" "}
                    {ids
                      .map((id) => byId.get(id))
                      .filter((x): x is NonNullable<typeof x> => !!x)
                      .sort((a, b) => a.label.localeCompare(b.label))
                      .map((x, n) => (
                        <span key={x.id}>
                          {n > 0 && ", "}
                          <Link href={`/initiatives/${x.slug}`} className="hover:text-accent">
                            {x.label}
                          </Link>
                        </span>
                      ))}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
