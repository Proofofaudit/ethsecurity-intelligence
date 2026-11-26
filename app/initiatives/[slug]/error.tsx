"use client";

import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div role="alert" className="max-w-[640px] border-t border-ink pt-4">
      <p className="eyebrow">Error</p>
      <h1 className="mt-1 text-[24px] leading-8 font-semibold">This page could not be loaded</h1>
      <p className="mt-2 text-md text-ink-2">The published dataset may be temporarily unavailable. No data was changed.</p>
      {error.digest && <p className="num mt-2 text-xs text-ink-3">Reference {error.digest}</p>}
      <button type="button" onClick={reset} className="mt-6 h-8 rounded-sm border border-rule-2 px-3 text-sm hover:border-ink-3">
        Try again
      </button>
    </div>
  );
}
