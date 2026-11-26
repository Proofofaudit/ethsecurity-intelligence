"use client";

import { cn } from "@/lib/util/cn";
import { setReviewed, useWorkspace } from "./store";

/** Marks an initiative as reviewed in the private workspace (stored only in this browser). */
export function ReviewedButton({ id, title, className }: { id: string; title: string; className?: string }) {
  const w = useWorkspace();
  const reviewed = !!w.initiatives.find((x) => x.id === id)?.reviewedAt;
  return (
    <button
      type="button"
      onClick={() => setReviewed(id, !reviewed)}
      aria-pressed={reviewed}
      aria-label={reviewed ? `Clear the reviewed mark on ${title}` : `Mark ${title} as reviewed`}
      title="Stored in this browser only"
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-sm border px-2 text-xs whitespace-nowrap transition-colors",
        reviewed ? "border-ink bg-ink text-paper" : "border-rule-2 text-ink-2 hover:border-ink-3 hover:text-ink",
        className,
      )}
    >
      <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
        <path d="M2 6.5l2.5 2.5L10 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {reviewed ? "Reviewed" : "Mark reviewed"}
    </button>
  );
}
