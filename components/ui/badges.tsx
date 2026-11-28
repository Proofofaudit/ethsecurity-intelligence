import { Mark } from "@/components/ui/status";
import { DELIVERY_BADGE_LABEL, EVIDENCE_BADGE_LABEL, type BadgeCount, type DeliveryBadgeKind, type EvidenceBadgeKind } from "@/lib/search/badge-kinds";
import { cn } from "@/lib/util/cn";

type Glyph = Parameters<typeof Mark>[0]["glyph"];

/** Same palette as the evidence marks: green verified, amber partial, gray unverified, red contradicted. Text and a shape always accompany the color. */
const EVIDENCE_UI: Record<EvidenceBadgeKind, { glyph: Glyph; tone: string }> = {
  verified: { glyph: "full", tone: "bg-st-verified-wash text-st-verified border-st-verified" },
  not_verified: { glyph: "ring", tone: "bg-paper-3 text-ink-2 border-rule-2" },
  contradicted: { glyph: "cross", tone: "bg-paper-3 text-st-contradicted border-st-contradicted" },
  not_found: { glyph: "dash", tone: "bg-paper-2 text-ink-3 border-rule-2" },
};
const DELIVERY_UI: Record<DeliveryBadgeKind, { glyph: Glyph; tone: string }> = {
  delivered: { glyph: "full", tone: "bg-st-verified-wash text-st-verified border-st-verified" },
  partial: { glyph: "half", tone: "bg-st-partial-wash text-st-partial border-st-partial" },
  none: { glyph: "dash", tone: "bg-paper-2 text-ink-3 border-rule-2" },
};

function Pill({ glyph, tone, children, kind, className }: { glyph: Glyph; tone: string; children: React.ReactNode; kind: string; className?: string }) {
  return (
    <span data-badge={kind} className={cn("inline-flex items-center gap-1.5 rounded-xs border px-1.5 py-0.5 text-2xs font-medium whitespace-nowrap", tone, className)}>
      <Mark glyph={glyph} />
      {children}
    </span>
  );
}

export function EvidenceBadge({ kind, count, className }: { kind: EvidenceBadgeKind; count?: number; className?: string }) {
  const ui = EVIDENCE_UI[kind];
  return (
    <Pill glyph={ui.glyph} tone={ui.tone} kind={`evidence-${kind}`} className={className}>
      {EVIDENCE_BADGE_LABEL[kind]}
      {count !== undefined && count > 1 && <span className="num font-normal">{count}</span>}
    </Pill>
  );
}

export function DeliveryBadge({ kind, count, className }: { kind: DeliveryBadgeKind; count?: number; className?: string }) {
  const ui = DELIVERY_UI[kind];
  return (
    <Pill glyph={ui.glyph} tone={ui.tone} kind={`delivery-${kind}`} className={className}>
      {DELIVERY_BADGE_LABEL[kind]}
      {count !== undefined && count > 1 && <span className="num font-normal">{count}</span>}
    </Pill>
  );
}

export const NOT_YET_RESEARCHED = "Not yet researched";

/** One-line key so the badge colours have words next to them. */
export function BadgeKey() {
  return (
    <ul className="flex flex-wrap items-center gap-1.5" aria-label="Badge colours">
      <li>
        <EvidenceBadge kind="verified" />
      </li>
      <li>
        <EvidenceBadge kind="not_verified" />
      </li>
      <li>
        <EvidenceBadge kind="contradicted" />
      </li>
      <li>
        <EvidenceBadge kind="not_found" />
      </li>
      <li>
        <DeliveryBadge kind="delivered" />
      </li>
      <li>
        <DeliveryBadge kind="partial" />
      </li>
      <li>
        <DeliveryBadge kind="none" />
      </li>
    </ul>
  );
}

/** Evidence row for a card: claim-check badges, then delivery badges. "Not yet researched" when no team research exists. */
export function BadgeRow({ evidence, delivery, className }: { evidence: BadgeCount<EvidenceBadgeKind>[] | null; delivery: BadgeCount<DeliveryBadgeKind>[] | null; className?: string }) {
  if (!evidence) {
    return (
      <p className={cn("text-2xs text-ink-3", className)} data-badge-row="none">
        {NOT_YET_RESEARCHED}
      </p>
    );
  }
  if (evidence.length === 0 && (delivery ?? []).length === 0) {
    return (
      <p className={cn("text-2xs text-ink-3", className)} data-badge-row="empty">
        No claim checks recorded
      </p>
    );
  }
  return (
    <ul className={cn("flex flex-wrap gap-1", className)} aria-label="Evidence and delivery" data-badge-row="researched">
      {evidence.map((b) => (
        <li key={b.kind}>
          <EvidenceBadge kind={b.kind} count={b.count} />
        </li>
      ))}
      {(delivery ?? []).map((b) => (
        <li key={b.kind}>
          <DeliveryBadge kind={b.kind} count={b.count} />
        </li>
      ))}
    </ul>
  );
}
