import { handle, load, ok } from "@/lib/api/http";
import { thedaoPointer } from "@/lib/api/thedao-pointer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/funding-relationships: live backer and pledge lists stay on TheDAO. */
export const GET = handle(async () => {
  const { dataset } = await load();
  return ok(dataset, thedaoPointer(), {
    limitations: ["Pledge lists, concentration and self-pledge amounts are not copied from TheDAO."],
  });
});
