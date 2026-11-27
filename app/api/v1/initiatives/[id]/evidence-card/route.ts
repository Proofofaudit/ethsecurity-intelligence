import { evidenceCard } from "@/lib/intelligence/service";
import { handle, idFrom, load, ok, type Ctx } from "@/lib/api/http";
import { requireInitiative } from "@/lib/api/initiative";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/initiatives/:id/evidence-card: six-section evidence card, every item with a source URL and checked-on date. */
export const GET = handle(async (_req: Request, ctx: Ctx<{ id: string }>) => {
  const id = idFrom((await ctx.params).id);
  const { dataset } = await load();
  const ini = requireInitiative(dataset, id);
  const card = evidenceCard(dataset, ini.id);
  const sources = [...new Set((card?.sections ?? []).flatMap((s) => s.items.map((i) => i.sourceUrl)))];
  return ok(dataset, card, { sources });
});
