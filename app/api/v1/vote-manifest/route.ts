import { handle, load, ok } from "@/lib/api/http";
import { THEDAO_VOTE, thedaoPointer } from "@/lib/api/thedao-pointer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/vote-manifest: no countdown, pool or tally times. The vote app is the source. */
export const GET = handle(async () => {
  const { dataset } = await load();
  return ok(dataset, { ...thedaoPointer(THEDAO_VOTE), schedule: null, pool: null, countdown: null }, {
    limitations: ["Pool size, tally times and the countdown are not copied. Open the official vote app."],
  });
});
