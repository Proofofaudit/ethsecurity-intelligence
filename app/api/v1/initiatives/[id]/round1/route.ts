import { round1History, round1Sources } from "@/lib/intelligence/service";
import { handle, idFrom, load, ok, type Ctx } from "@/lib/api/http";
import { requireInitiative } from "@/lib/api/initiative";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/initiatives/:id/round1: TheDAO / Giveth Round 1 records matched to the initiative, with reasons. */
export const GET = handle(async (_req: Request, ctx: Ctx<{ id: string }>) => {
  const id = idFrom((await ctx.params).id);
  const { dataset } = await load();
  const ini = requireInitiative(dataset, id);
  const view = round1History(dataset, ini.id);
  return ok(dataset, view, { sources: round1Sources(dataset), limitations: dataset.round1.limitations });
});
