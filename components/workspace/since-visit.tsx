"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { formatDateTime } from "@/components/ui/money";
import { formatUsd } from "@/lib/util/money";
import type { FundingView } from "@/lib/vote/view-data";
import { askDeltas, type AskDelta, type FundingSnapshot } from "./schema";
import { recordFundingVisit, useWorkspace } from "./store";

/** Set once this page load has stored its view of the asks, so the baseline shown is final. */
let recorded = false;
const listeners = new Set<() => void>();
const subscribeRecorded = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/**
 * Records this page view of TheDAO asks (once per page load) and returns the baseline from the
 * previous visit: undefined until recorded, null on the first visit in this browser.
 */
export function useFundingBaseline(view: Pick<FundingView, "datasetVersion" | "asks">): FundingSnapshot | null | undefined {
  const w = useWorkspace();
  const ready = useSyncExternalStore(
    subscribeRecorded,
    () => recorded,
    () => false,
  );
  useEffect(() => {
    if (recorded) return;
    recordFundingVisit(view.datasetVersion, view.asks);
    recorded = true;
    listeners.forEach((l) => l());
  }, [view.datasetVersion, view.asks]);
  return ready ? w.funding.baseline : undefined;
}

export function askDeltaText(delta: AskDelta): string {
  return `ask ${delta.deltaCents < 0 ? "down" : "up"} ${formatUsd(Math.abs(delta.deltaCents))} since your last visit`;
}

/** Inline per-initiative note; renders nothing unless the ask really changed. */
export function AskDeltaNote({ delta, className }: { delta: AskDelta | undefined; className?: string }) {
  if (!delta) return null;
  return (
    <span data-ask-delta={delta.deltaCents < 0 ? "down" : "up"} className={className ?? "text-xs text-ink-2"}>
      TheDAO {askDeltaText(delta)}
    </span>
  );
}

function ageText(iso: string, now: number): string {
  const h = Math.max(0, Math.floor((now - Date.parse(iso)) / 3_600_000));
  if (h < 1) return "under an hour old";
  if (h < 48) return `${h} ${h === 1 ? "hour" : "hours"} old`;
  return `${Math.floor(h / 24)} days old`;
}

const getNow = () => Date.now();
const noop = () => () => {};

/** "Since last visit" summary for Overview: every initiative whose TheDAO ask changed. */
export function SinceLastVisit({ view }: { view: FundingView }) {
  const baseline = useFundingBaseline(view);
  const now = useSyncExternalStore(noop, getNow, () => null);
  const deltas = baseline ? askDeltas(baseline, view.asks).sort((a, b) => (view.names[a.id]?.label ?? "").localeCompare(view.names[b.id]?.label ?? "")) : [];
  return (
    <section aria-labelledby="since-visit-h" data-since-visit className="border-t border-ink pt-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="since-visit-h" className="text-md font-semibold">
          Since last visit
        </h2>
        <p className="text-xs text-ink-3">
          TheDAO asks as of <span className="num">{formatDateTime(view.asOf)}</span>
          {now !== null && <> ({ageText(view.asOf, now)})</>}
        </p>
      </div>
      {view.staleNote && <p className="mb-2 border-l-2 border-st-partial pl-3 text-xs text-ink-2">{view.staleNote}</p>}
      {baseline === undefined ? (
        <p className="text-sm text-ink-3">Comparing with your last visit in this browser…</p>
      ) : baseline === null ? (
        <p className="text-sm text-ink-3">This is your first visit recorded in this browser. Changes in TheDAO asks will be listed here next time.</p>
      ) : deltas.length === 0 ? (
        <p className="text-sm text-ink-2" data-no-delta>
          No TheDAO ask has changed since your last visit ({formatDateTime(baseline.at)}).
        </p>
      ) : (
        <>
          <p className="mb-2 text-xs text-ink-3">
            {deltas.length} {deltas.length === 1 ? "initiative" : "initiatives"} changed since your last visit ({formatDateTime(baseline.at)}). Alphabetical (neutral).
          </p>
          <ul className="grid gap-x-8 divide-y divide-rule border-y border-rule md:grid-cols-2 md:divide-y-0">
            {deltas.map((d) => {
              const n = view.names[d.id];
              return (
                <li key={d.id} className="flex items-baseline justify-between gap-3 py-1.5 text-sm md:border-b md:border-rule">
                  {n ? (
                    <Link href={`/initiatives/${n.slug}`} className="min-w-0 truncate font-medium hover:text-accent">
                      {n.label}
                    </Link>
                  ) : (
                    <span>{d.id}</span>
                  )}
                  <span className="shrink-0 text-right text-xs">
                    <AskDeltaNote delta={d} className="text-ink-2" />
                    <span className="num block text-2xs text-ink-3">
                      {formatUsd(d.beforeCents)} → {formatUsd(d.afterCents)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <p className="mt-2 text-2xs text-ink-3">The comparison is kept in this browser only. No notifications or emails are sent.</p>
    </section>
  );
}
