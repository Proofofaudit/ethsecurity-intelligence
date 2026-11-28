import { traceClaim } from "@/lib/intelligence/service";
import { handle, idFrom, load, notFound, ok, type Ctx } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/claims/:id/trace: Evidence Impact Trace (metrics, views and outputs a change affects). */
export const GET = handle(async (_req: Request, ctx: Ctx<{ id: string }>) => {
  const id = idFrom((await ctx.params).id);
  const { dataset } = await load();
  const t = traceClaim(dataset, id);
  if (!t) throw notFound(`No claim with id "${id}"`);
  return ok(dataset, t, { sources: t.claim.sourceUrls.length ? t.claim.sourceUrls : undefined });
});
