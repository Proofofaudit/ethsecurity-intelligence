import type { ClaimStatus, DeliveryStatus } from "@/lib/team/types";

export type EvidenceBadgeKind = "verified" | "not_verified" | "contradicted" | "not_found";
export type DeliveryBadgeKind = "delivered" | "partial" | "none";

export const EVIDENCE_BADGE_LABEL: Record<EvidenceBadgeKind, string> = {
  verified: "Verified",
  not_verified: "Not verified",
  contradicted: "Contradicted",
  not_found: "Not found",
};
export const DELIVERY_BADGE_LABEL: Record<DeliveryBadgeKind, string> = {
  delivered: "Delivered",
  partial: "Partly delivered",
  none: "No public evidence",
};

export const CLAIM_TO_BADGE: Record<ClaimStatus, EvidenceBadgeKind> = {
  Verified: "verified",
  "Not verified": "not_verified",
  "Contradicted by source": "contradicted",
};
export const DELIVERY_TO_BADGE: Record<DeliveryStatus, DeliveryBadgeKind> = {
  Delivered: "delivered",
  "Partly delivered": "partial",
  "No public evidence": "none",
};

export interface BadgeCount<K extends string> {
  kind: K;
  count: number;
}
