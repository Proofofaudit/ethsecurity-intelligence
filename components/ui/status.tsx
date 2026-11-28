import type { EvidenceStatus } from "@/lib/domain/schemas";
import { EVIDENCE_STATUS_LABEL } from "@/lib/domain/schemas";
import { cn } from "@/lib/util/cn";

type Glyph = "full" | "half" | "ring" | "dashed" | "square" | "cross" | "bang" | "dash";

/**
 * Fixed evidence mark system. The mark is always paired with a text label, so status is never
 * conveyed by color or shape alone. Short labels are plain-language; the formal label from
 * EVIDENCE_STATUS_LABEL is exposed as the accessible name and tooltip.
 */
export const STATUS_UI: Record<EvidenceStatus, { glyph: Glyph; short: string; tone: string }> = {
  independently_verified: { glyph: "full", short: "Verified", tone: "text-st-verified" },
  partially_supported: { glyph: "half", short: "Partly supported", tone: "text-st-partial" },
  applicant_reported: { glyph: "ring", short: "Applicant says", tone: "text-st-applicant" },
  not_independently_verified: { glyph: "ring", short: "Not verified", tone: "text-st-applicant" },
  future_target: { glyph: "dashed", short: "Future plan", tone: "text-st-future" },
  officially_reported: { glyph: "square", short: "Official record", tone: "text-st-official" },
  contradicted: { glyph: "cross", short: "Contradicted", tone: "text-st-contradicted" },
  disputed: { glyph: "bang", short: "Disputed", tone: "text-st-partial" },
  outdated: { glyph: "dash", short: "Outdated", tone: "text-ink-3" },
  not_applicable: { glyph: "dash", short: "Not applicable", tone: "text-ink-3" },
};

export function Mark({ glyph, className }: { glyph: Glyph; className?: string }) {
  const c = "currentColor";
  return (
    <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true" className={cn("inline-block shrink-0 translate-y-[0.5px]", className)}>
      {glyph === "full" && <circle cx="5" cy="5" r="4.25" fill={c} />}
      {glyph === "half" && (
        <>
          <circle cx="5" cy="5" r="4" fill="none" stroke={c} strokeWidth="1.25" />
          <path d="M5 1 A4 4 0 0 0 5 9 Z" fill={c} />
        </>
      )}
      {glyph === "ring" && <circle cx="5" cy="5" r="3.9" fill="none" stroke={c} strokeWidth="1.25" />}
      {glyph === "dashed" && <circle cx="5" cy="5" r="3.9" fill="none" stroke={c} strokeWidth="1.25" strokeDasharray="1.9 1.4" />}
      {glyph === "square" && <rect x="1.5" y="1.5" width="7" height="7" fill={c} />}
      {glyph === "cross" && <path d="M2 2 L8 8 M8 2 L2 8" stroke={c} strokeWidth="1.5" />}
      {glyph === "bang" && (
        <>
          <circle cx="5" cy="5" r="3.9" fill="none" stroke={c} strokeWidth="1.25" />
          <path d="M5 2.8 V5.6" stroke={c} strokeWidth="1.25" />
          <circle cx="5" cy="7.1" r="0.7" fill={c} />
        </>
      )}
      {glyph === "dash" && <path d="M2 5 H8" stroke={c} strokeWidth="1.5" />}
    </svg>
  );
}

export function StatusMark({ status, className, compact = false }: { status: EvidenceStatus; className?: string; compact?: boolean }) {
  const ui = STATUS_UI[status];
  const formal = EVIDENCE_STATUS_LABEL[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium", ui.tone, className)} title={formal} aria-label={`Status: ${formal}`}>
      <Mark glyph={ui.glyph} />
      {!compact && <span>{ui.short}</span>}
    </span>
  );
}

/** Legend for the four primary marks plus official records. */
export function StatusLegend({ className }: { className?: string }) {
  const items: EvidenceStatus[] = ["independently_verified", "partially_supported", "applicant_reported", "future_target", "officially_reported"];
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1", className)} aria-label="Evidence status legend">
      {items.map((s) => (
        <li key={s}>
          <StatusMark status={s} />
        </li>
      ))}
    </ul>
  );
}
