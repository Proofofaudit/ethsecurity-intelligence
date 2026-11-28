import type { Evidence } from "@/lib/domain/schemas";

/**
 * Evidence kind labels. Kept out of components/dossier/inspector.tsx because that file is a client
 * module: a server page importing a non-component export from it receives a client reference, and
 * indexing it returns undefined (the "undefined (N)" headings).
 */
export const EVIDENCE_KIND_LABEL: Record<Evidence["kind"], string> = {
  official_record: "Official record",
  http_check: "Web page check",
  github_repository: "GitHub repository",
  github_pull_request: "GitHub pull request",
  github_profile: "GitHub profile",
  onchain_transaction: "Onchain transaction",
  proposal_text: "Proposal text",
  curated_source: "Curated source",
};

/** Label for any kind string, with a readable fallback so a heading is never "undefined". */
export function evidenceKindLabel(kind: string): string {
  const known = (EVIDENCE_KIND_LABEL as Record<string, string | undefined>)[kind];
  if (known) return known;
  const words = kind.replace(/_/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Other";
}

/** Heading for one group of the dossier Evidence sources section. */
export function evidenceGroupTitle(kind: string, count: number): string {
  return `${evidenceKindLabel(kind)} (${count})`;
}
