import { handle, load, ok } from "@/lib/api/http";
import { thedaoPointer } from "@/lib/api/thedao-pointer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/simulate: the what-if lab is not published. Funding assumptions stay on TheDAO. */
export const POST = handle(async () => {
  const { dataset } = await load();
  return ok(dataset, thedaoPointer(), {}, { cache: "private" });
});
