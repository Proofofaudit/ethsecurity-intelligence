"use client";

import { BANNER_HREF, BANNER_TEXT } from "@/lib/disclosure";
import "./globals.css";

/**
 * Replaces the root layout when the layout itself fails. The disclosure banner is repeated
 * inline here, because the regular banner lives in the layout.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en-US">
      <body className="bg-paper text-ink">
        <div className="border-b border-rule bg-paper-2" role="region" aria-label="Conflict-of-interest disclosure" data-coi-banner="">
          <p className="mx-auto max-w-[1320px] px-5 py-1.5 text-2xs break-words text-ink-2 md:px-8">
            <span className="text-ink">{BANNER_TEXT}</span>{" "}
            <a href={BANNER_HREF} className="link whitespace-nowrap">
              Read the disclosure
            </a>
          </p>
        </div>
        <main className="mx-auto max-w-[1320px] px-5 pt-8 md:px-8">
          <div role="alert" className="max-w-[640px] border-t border-ink pt-4">
            <p className="eyebrow">Error</p>
            <h1 className="mt-1 text-[24px] leading-8 font-semibold">This page could not be loaded</h1>
            <p className="mt-2 text-md text-ink-2">The site could not start this page. No data was changed.</p>
            <button type="button" onClick={reset} className="mt-6 h-8 rounded-sm border border-rule-2 px-3 text-sm hover:border-ink-3">
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
