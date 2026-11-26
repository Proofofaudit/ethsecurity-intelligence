"use client";

import Link from "next/link";
import { formatDateTime } from "@/components/ui/money";
import { markChangesReviewed, useWorkspace } from "./store";

/** "What changed since my last review?" using the review time stored in this browser. */
export function SinceLastReview({ basePath, latestChangeAt }: { basePath: string; latestChangeAt: string | null }) {
  const w = useWorkspace();
  const last = w.lastReviewAt;
  const newer = last && latestChangeAt ? latestChangeAt > last : false;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      {last ? (
        <>
          <span className="text-ink-2">
            Your last review: <span className="num">{formatDateTime(last)}</span>
            {newer ? "; newer changes exist." : "; nothing newer is recorded."}
          </span>
          <Link href={`${basePath}?since=${encodeURIComponent(last)}`} className="link">
            Show changes since then
          </Link>
        </>
      ) : (
        <span className="text-ink-3">Mark the log as reviewed to compare against it next time. The time is stored in this browser only.</span>
      )}
      <button type="button" onClick={markChangesReviewed} className="text-ink-3 underline-offset-4 hover:text-accent hover:underline">
        Mark as reviewed now
      </button>
    </div>
  );
}
