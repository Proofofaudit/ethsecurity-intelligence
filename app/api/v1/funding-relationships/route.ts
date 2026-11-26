import { fundingRelationships } from "@/lib/intelligence/service";
import { handle, load, ok } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/funding-relationships: backers, multi-initiative backers, self-pledges and concentration. */
export const GET = handle(async () => {
  const { dataset } = await load();
  return ok(dataset, fundingRelationships(dataset), {
    limitations: ["Backer identity is resolved by documented alias rules; unconfirmed candidate matches are listed separately and never merged."],
  });
});
