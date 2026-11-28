/** Browser-safe constants shared by the server-side live manifest cache and the UI. */

/** Cache lifetime of the server's live manifest read, inside the required 10 to 15 minutes. */
export const LIVE_TTL_MS = 12 * 60_000;
export const LIVE_TTL_MINUTES = LIVE_TTL_MS / 60_000;
