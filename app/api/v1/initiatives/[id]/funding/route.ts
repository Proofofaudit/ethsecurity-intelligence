import { fundingBreakdown } from "@/lib/intelligence/service";
import { handle, idFrom, load, ok, type Ctx } from "@/lib/api/http";
import { initiativeSources, requireInitiative } from "@/lib/api/initiative";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/initiatives/:id/funding: official funding figures, pledge rows and donations. */
export const GET = handle(async (_req: Request, ctx: Ctx<{ id: string }>) => {
  const id = idFrom((await ctx.params).id);
  const { dataset } = await load();
  const ini = requireInitiative(dataset, id);
  return ok(dataset, fundingBreakdown(dataset, ini), { sources: initiativeSources(ini) });
});
