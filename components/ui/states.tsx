import Link from "next/link";

/** Skeleton made of thin rules, matching the report layout. */
export function LoadingReport({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" className="animate-pulse">
      <span className="sr-only">{label}</span>
      <div className="mb-3 h-3 w-40 rounded-xs bg-paper-3" />
      <div className="mb-2 h-7 w-[min(560px,90%)] rounded-xs bg-paper-3" />
      <div className="mb-10 h-4 w-[min(420px,70%)] rounded-xs bg-paper-2" />
      <div className="grid grid-cols-2 gap-px border-y border-ink bg-rule sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="bg-paper p-4">
            <div className="mb-2 h-3 w-20 rounded-xs bg-paper-2" />
            <div className="h-5 w-24 rounded-xs bg-paper-3" />
          </div>
        ))}
      </div>
      <div className="mt-10 space-y-3">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-4 rounded-xs bg-paper-2" style={{ width: `${92 - ((i * 7) % 30)}%` }} />
        ))}
      </div>
    </div>
  );
}

export function NotFoundNotice({ title, body }: { title: string; body: string }) {
  return (
    <div className="max-w-[640px] border-t border-ink pt-4">
      <p className="eyebrow">Not found</p>
      <h1 className="mt-1 text-[24px] leading-8 font-semibold">{title}</h1>
      <p className="mt-2 text-md text-ink-2">{body}</p>
      <p className="mt-6 flex gap-5 text-sm">
        <Link href="/initiatives" className="link">
          Browse all initiatives
        </Link>
        <Link href="/" className="link">
          Overview
        </Link>
      </p>
    </div>
  );
}
