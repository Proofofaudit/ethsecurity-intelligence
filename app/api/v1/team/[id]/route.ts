import { handle, idFrom, load, ok, type Ctx } from "@/lib/api/http";
import { initiativeSources, requireInitiative } from "@/lib/api/initiative";
import { loadTeamResearch } from "@/lib/team/load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/team/:id: team, organization, delivery and claim-check research for one initiative (id or slug). */
export const GET = handle(async (_req: Request, ctx: Ctx<{ id: string }>) => {
  const id = idFrom((await ctx.params).id);
  const { dataset } = await load();
  const ini = requireInitiative(dataset, id);
  return ok(dataset, loadTeamResearch(ini.id), { sources: initiativeSources(ini) });
});
