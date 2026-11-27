"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { useWorkspace } from "@/components/workspace/store";
import { chainOrder, chainTotalMinutes, focusInitiativeIds } from "@/lib/intelligence/briefing";
import { mayInterest, type FocusId } from "@/lib/vote/interest";
import type { InterestView } from "@/lib/vote/view-data";

export interface ChainEntry {
  id: string;
  slug: string;
  title: string;
  totalMinutes: number;
  node: ReactNode;
}

/**
 * "Briefing for all in my focus". Uses the same local selection as "May interest you" (focus chips
 * and keywords), chains the briefings in alphabetical order by official title and shows the total time.
 * The selection is read in this browser; nothing is sent to the server.
 */
export function BriefingChain({ view, entries }: { view: InterestView; entries: ChainEntry[] }) {
  const w = useWorkspace();
  const focus = w.interest.focus as FocusId[];
  const chain = useMemo(() => {
    const ids = new Set(focusInitiativeIds(mayInterest(view.initiatives, focus, w.interest.keywords, view.chips)));
    return chainOrder(entries.filter((e) => ids.has(e.id)));
  }, [view, entries, focus, w.interest.keywords]);
  const total = chainTotalMinutes(chain);

  if (focus.length === 0 && w.interest.keywords.length === 0)
    return (
      <p className="max-w-[720px] text-sm text-ink-3" data-testid="briefing-chain-empty">
        No focus selected in this browser. Choose focus chips or keywords under{" "}
        <Link href="/workspace#may-interest" className="link">
          May interest you
        </Link>
        , then return here.
      </p>
    );
  if (chain.length === 0)
    return (
      <p className="max-w-[720px] text-sm text-ink-3" data-testid="briefing-chain-empty">
        Your focus matches no initiative with an official link. Change it under{" "}
        <Link href="/workspace#may-interest" className="link">
          May interest you
        </Link>
        .
      </p>
    );
  return (
    <div data-testid="briefing-chain" data-chain-total={total}>
      <p className="num border-b border-ink pb-2 text-sm" data-testid="briefing-chain-total">
        {chain.length} {chain.length === 1 ? "briefing" : "briefings"} · total {total} min · {NEUTRAL}
      </p>
      <ol className="mb-2 mt-2 columns-1 text-sm sm:columns-2" data-testid="briefing-chain-list">
        {chain.map((e) => (
          <li key={e.id} className="py-0.5">
            <a href={`#briefing-${e.slug}`} className="link">
              {e.title}
            </a>
            <span className="num ml-2 text-xs text-ink-3">{e.totalMinutes} min</span>
          </li>
        ))}
      </ol>
      {chain.map((e) => (
        <div key={e.id} data-chain-item={e.slug}>
          {e.node}
        </div>
      ))}
    </div>
  );
}

const NEUTRAL = "Alphabetical by title (neutral)";
