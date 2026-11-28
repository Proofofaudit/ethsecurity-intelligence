"use client";

import { cn } from "@/lib/util/cn";
import { toggleSaved, useWorkspace } from "./store";

/** Adds or removes an initiative from the private workspace (stored only in this browser). */
export function SaveButton({ id, title, compact, className }: { id: string; title: string; compact?: boolean; className?: string }) {
  const w = useWorkspace();
  const saved = w.initiatives.some((x) => x.id === id);
  return (
    <button
      type="button"
      onClick={() => toggleSaved(id)}
      aria-pressed={saved}
      aria-label={saved ? `Saved: remove ${title} from My Workspace` : `Save ${title} to My Workspace`}
      title={saved ? "In My Workspace (stored in this browser only)" : "Add to My Workspace (stored in this browser only)"}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-sm border px-2 text-xs whitespace-nowrap transition-colors",
        saved ? "border-ink bg-ink text-paper" : "border-rule-2 text-ink-2 hover:border-ink-3 hover:text-ink",
        className,
      )}
    >
      <svg viewBox="0 0 10 12" width="9" height="11" aria-hidden="true">
        <path d="M1 1h8v10L5 8 1 11z" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.2" />
      </svg>
      {!compact && (saved ? "Saved" : "Save")}
    </button>
  );
}
