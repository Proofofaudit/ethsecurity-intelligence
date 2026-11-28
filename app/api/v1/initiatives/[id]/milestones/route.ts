import { handle, idFrom, load, ok, type Ctx } from "@/lib/api/http";
import { initiativeSources, requireInitiative } from "@/lib/api/initiative";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/initiatives/:id/milestones: official milestones in proposal order. */
export const GET = handle(async (_req: Request, ctx: Ctx<{ id: string }>) => {
  const id = idFrom((await ctx.params).id);
  const { dataset } = await load();
  const ini = requireInitiative(dataset, id);
  const milestones = dataset.milestones
    .filter((m) => m.initiativeId === ini.id)
    .sort((a, b) => a.index - b.index)
    .map(({ amountCents: _amount, shareOfGoal: _share, ...rest }) => rest);
  return ok(dataset, { initiativeId: ini.id, slug: ini.slug, total: milestones.length, items: milestones, amounts: "On TheDAO" }, { sources: initiativeSources(ini) });
});
