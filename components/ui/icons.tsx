/** Inline arrows (SVG) so they render identically on every platform and font. */
export function ArrowRight({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" width="0.9em" height="0.9em" aria-hidden="true" className={`inline-block align-[-0.08em] ${className ?? ""}`}>
      <path d="M1.5 6h8.5M7 3l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ArrowUpRight({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" width="0.8em" height="0.8em" aria-hidden="true" className={`ml-0.5 inline-block align-[-0.02em] ${className ?? ""}`}>
      <path d="M3 9l6-6M4.5 3H9v4.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
