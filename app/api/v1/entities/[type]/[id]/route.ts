import { handle, idFrom, load, ok, type Ctx } from "@/lib/api/http";
import { parseEntityType, requireEntityProfile } from "@/lib/api/entity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/entities/:type/:id: profile of any graph entity. */
export const GET = handle(async (_req: Request, ctx: Ctx<{ type: string; id: string }>) => {
  const p = await ctx.params;
  const type = parseEntityType(p.type);
  const id = idFrom(p.id);
  const { dataset } = await load();
  return ok(dataset, requireEntityProfile(dataset, type, id));
});
