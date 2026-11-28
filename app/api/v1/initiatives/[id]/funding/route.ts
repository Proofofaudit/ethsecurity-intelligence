import { handle, idFrom, load, ok, type Ctx } from "@/lib/api/http";
import { thedaoPointer } from "@/lib/api/thedao-pointer";
import { initiativeSources, requireInitiative } from "@/lib/api/initiative";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/initiatives/:id/funding: a link to TheDAO. Live figures are not copied. */
export const GET = handle(async (_req: Request, ctx: Ctx<{ id: string }>) => {
  const id = idFrom((await ctx.params).id);
  const { dataset } = await load();
  const ini = requireInitiative(dataset, id);
  return ok(dataset, thedaoPointer(ini.url), { sources: initiativeSources(ini) });
});
