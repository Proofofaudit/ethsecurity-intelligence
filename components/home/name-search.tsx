"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { InitiativeCard } from "@/components/ui/initiative-card";
import { canShowDirectly, matchHolders, MIN_QUERY_LENGTH, type BadgeHolder } from "@/lib/search/badge-holders";
import { connectionsFor, type SearchIndex } from "@/lib/search/connections";

export const NOT_LOADED_TEXT = "Name search is not loaded yet";
export const NO_MATCH_TEXT = "No public connection was found for that name or handle.";

/**
 * Badge-holder name search. Everything runs in this component: the holder list arrives with the
 * page, the query lives only in React state and is never put in a URL, a request, storage or a log.
 * There is deliberately no form element, so pressing Enter cannot submit the query anywhere.
 */
export function NameSearch({ holders, index, total }: { holders: BadgeHolder[] | null; index: SearchIndex; total: number }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<{ query: string; holder: BadgeHolder } | null>(null);

  const matches = useMemo(() => (holders ? matchHolders(holders, query) : []), [holders, query]);
  const typed = query.trim().length >= MIN_QUERY_LENGTH;
  const chosen = picked && picked.query === query ? picked.holder : canShowDirectly(matches) ? matches[0]!.holder : null;
  const groups = useMemo(() => (chosen ? connectionsFor(chosen, index) : []), [chosen, index]);

  return (
    <section aria-labelledby={`${id}-h`} data-name-search className="space-y-3">
      <h2 id={`${id}-h`} className="sr-only">
        Find initiatives connected to you
      </h2>
      <div role="search" className="max-w-[640px]">
        <label htmlFor={id} className="mb-1 block text-md font-semibold">
          Type your name or X handle
        </label>
        <input
          id={id}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={!holders}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          maxLength={80}
          aria-describedby={`${id}-help`}
          data-name-search-input
          className="h-11 w-full min-w-0 rounded-xs border-2 border-accent bg-paper px-3 text-md text-ink focus:outline-none disabled:cursor-not-allowed disabled:border-rule-2 disabled:text-ink-3"
        />
        <p id={`${id}-help`} className="mt-1 text-xs text-ink-3">
          {holders ? (
            <>
              Matching runs in your browser across <span className="num">{holders.length}</span> public listings.
            </>
          ) : (
            "Matching runs in your browser against a public list."
          )}{" "}
          What you type is not sent anywhere or stored.
        </p>
      </div>

      {!holders && (
        <p role="status" className="max-w-[640px] border-l-2 border-rule-2 pl-3 text-sm text-ink-2" data-name-search-state="not-loaded">
          {NOT_LOADED_TEXT}. Browse all {total} initiatives instead:{" "}
          <Link href="/initiatives" className="link">
            Initiatives
          </Link>
          .
        </p>
      )}

      <div aria-live="polite" data-name-search-results>
        {holders && typed && matches.length === 0 && <NoMatch total={total} />}

        {holders && typed && matches.length > 0 && !chosen && (
          <div data-name-search-state="disambiguate" className="max-w-[640px]">
            <p className="mb-1 text-sm text-ink-2">{matches.length === 1 ? "One possible match. Choose it to continue:" : `${matches.length} possible matches. Choose yours:`}</p>
            <ul className="divide-y divide-rule border-y border-rule">
              {matches.slice(0, 12).map((m) => (
                <li key={`${m.holder.name}|${m.holder.xHandle}|${m.holder.organisation}`}>
                  <button type="button" onClick={() => setPicked({ query, holder: m.holder })} className="flex w-full flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-1 py-2 text-left text-sm hover:bg-paper-2 focus-visible:bg-paper-2" data-holder-option>
                    <span className="font-medium">{m.holder.name}</span>
                    <span className="text-xs text-ink-3">
                      {m.holder.organisation || "No organization listed"}
                      {m.holder.xHandle && <> · @{m.holder.xHandle}</>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {matches.length > 12 && <p className="mt-1 text-xs text-ink-3">Showing the first 12. Type more of the name to narrow the list.</p>}
          </div>
        )}

        {holders && typed && chosen && (
          <div data-name-search-state="results" className="space-y-6">
            {groups.length > 0 && (
              <p className="rounded-xs border border-accent bg-accent-wash px-3 py-2 text-sm text-ink">
                Showing public connections for <span className="font-medium">{chosen.name}</span>
                {chosen.organisation && <>, {chosen.organisation}</>}
                {chosen.xHandle && <> (@{chosen.xHandle})</>}. Every card names the public source for its reason.
              </p>
            )}
            {groups.length === 0 && <FoundWithoutLink name={chosen.name} total={total} />}
            {groups.map((g) => (
              <section key={g.key} aria-labelledby={`${id}-g-${g.key}`} data-result-group={g.key} className="rounded-xs border border-rule border-l-4 border-l-accent bg-paper px-3 py-2">
                <h3 id={`${id}-g-${g.key}`} className="mb-2 text-sm font-semibold text-accent">
                  {g.label} <span className="num font-normal text-ink-3">{g.cards.length}</span>
                </h3>
                <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
                  {g.cards.map((c) => (
                    <li key={c.card.id}>
                      <InitiativeCard card={c.card} why={c.why} evidence={c.evidence} headingLevel={4} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function FoundWithoutLink({ name, total }: { name: string; total: number }) {
  return (
    <div role="status" data-name-search-state="no-link" className="max-w-[680px] rounded-xs border border-accent bg-accent-wash px-3 py-2 text-sm text-ink">
      <p>
        <span className="font-medium">{name}</span> is on the public badge list. None of the {total} initiatives name them in a public team, repository or organisation record.
      </p>
      <p className="mt-1">
        <Link href="/initiatives" className="link">
          Browse all {total} initiatives
        </Link>
        {" · "}
        <Link href="/workspace#affiliations" className="link">
          My Affiliations
        </Link>
      </p>
    </div>
  );
}

function NoMatch({ total }: { total: number }) {
  return (
    <div role="status" data-name-search-state="no-match" className="max-w-[640px] rounded-xs border border-st-partial bg-st-partial-wash px-3 py-2 text-sm text-ink">
      <p>{NO_MATCH_TEXT}</p>
      <p className="mt-1">
        <Link href="/initiatives" className="link">
          Browse all {total} initiatives
        </Link>
        {" · "}
        <Link href="/workspace#affiliations" className="link">
          My Affiliations
        </Link>
      </p>
    </div>
  );
}
