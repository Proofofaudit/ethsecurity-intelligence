/**
 * Plain statements about where corrections are stored. The configured MongoDB Atlas cluster is
 * not reachable from this deployment (its network allowlist does not admit it), and the file
 * fallback is read-only here and not durable on Netlify, so submissions cannot be kept.
 */
export const CORRECTIONS_UNAVAILABLE_TITLE = "Corrections cannot be saved right now";

export const CORRECTIONS_UNAVAILABLE_BODY =
  "The MongoDB database that stores corrections is unreachable from this site. The file fallback used instead is not durable on Netlify, so a submission could be lost and is not accepted. Nothing on this page is lost: moderated corrections already applied to the research are still shown where the file copy has them. Please try again later, or report the problem in the public repository.";

export function correctionsStoreNotice(args: { failed: boolean; degraded: boolean; backend: "mongodb" | "file" }): { title: string; body: string } | null {
  if (args.failed || args.degraded) return { title: CORRECTIONS_UNAVAILABLE_TITLE, body: CORRECTIONS_UNAVAILABLE_BODY };
  if (args.backend === "file") {
    return {
      title: "Corrections use the file fallback",
      body: "No database is configured, so corrections are read from the published files only. The file fallback is not durable on Netlify and does not accept new submissions that persist.",
    };
  }
  return null;
}
