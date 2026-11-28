import type { Claim } from "@/lib/domain/schemas";

/**
 * Material statements that are the applicant's own, without independent support.
 * AI-origin claims are interpretations, not applicant statements, so they are excluded.
 */
export function unsupportedMaterialClaims(claims: readonly Claim[]): Claim[] {
  return claims.filter(
    (c) => c.material && c.origin !== "ai" && (c.status === "applicant_reported" || c.status === "not_independently_verified"),
  );
}
