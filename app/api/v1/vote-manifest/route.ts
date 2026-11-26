import { voteManifest } from "@/lib/intelligence/service";
import { handle, load, ok } from "@/lib/api/http";
import { LIVE_TTL_MINUTES, withLiveVote } from "@/lib/vote/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/vote-manifest: the official vote manifest (pool, schedule, ballot rules flag,
 * affiliation groups) with its slug/project alignment result. Groups and goals come from the
 * published dataset. Pool and schedule come from the server's cached live manifest read when one
 * passed validation (re-read at most every LIVE_TTL_MINUTES, shared by all callers), otherwise
 * from the published dataset. TheDAO's API is never called per request.
 */
export const GET = handle(async () => {
  const { dataset: published } = await load();
  const { dataset, live } = await withLiveVote(published);
  const v = voteManifest(dataset);
  return ok(dataset, { ...v, live }, {
    sources: [v.source],
    limitations: [
      live.source === "live"
        ? `Pool, schedule and readAt: live manifest read by this server at ${live.fetchedAt}, re-read at most every ${LIVE_TTL_MINUTES} minutes (fields listed in live.fields). Groups, goals, ballot rules, configRevision, fetchedAt and objectHash: last published sync. The vote contract is the final authority.`
        : "Read at the last official sync, not live. The vote contract is the final authority.",
      ...(v.features.groupsAvailable ? [] : ["Affiliation groups are withheld: the manifest is unavailable or its slug/project alignment was not confirmed."]),
    ],
  });
});
