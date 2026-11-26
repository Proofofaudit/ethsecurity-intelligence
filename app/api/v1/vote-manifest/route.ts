import { voteManifest } from "@/lib/intelligence/service";
import { handle, load, ok } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/vote-manifest: the official vote manifest from the last sync (pool, schedule, ballot
 * rules flag, affiliation groups) with its slug/project alignment result. Served from the published
 * dataset; TheDAO's API is never called per request.
 */
export const GET = handle(async () => {
  const { dataset } = await load();
  const v = voteManifest(dataset);
  return ok(dataset, v, {
    sources: [v.source],
    limitations: [
      "Read at the last official sync, not live. The vote contract is the final authority.",
      ...(v.features.groupsAvailable ? [] : ["Affiliation groups are withheld: the manifest is unavailable or its slug/project alignment was not confirmed."]),
    ],
  });
});
