import { HYPOTHESIS_NOTICE, SIMILAR_METHOD_VERSION, similarFor } from "@/lib/intelligence/service";
import { handle, idFrom, load, ok, type Ctx } from "@/lib/api/http";
import { requireInitiative } from "@/lib/api/initiative";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/initiatives/:id/similar: similar-initiative pairs (similar@1) with signals, quotes from both proposals and labels. */
export const GET = handle(async (_req: Request, ctx: Ctx<{ id: string }>) => {
  const id = idFrom((await ctx.params).id);
  const { dataset } = await load();
  const ini = requireInitiative(dataset, id);
  const items = similarFor(dataset, ini.id) ?? [];
  const sources = [...new Set([ini.url, ...items.flatMap((it) => it.signals.flatMap((s) => (s.quotes ?? []).map((q) => q.url.replace(/#.*$/, ""))))])];
  return ok(dataset, { method: SIMILAR_METHOD_VERSION, order: "Alphabetical (neutral) by the other initiative's title.", notice: HYPOTHESIS_NOTICE, items }, { sources });
});
