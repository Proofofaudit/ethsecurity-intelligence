import { handle, idFrom, load, ok, type Ctx } from "@/lib/api/http";
import { requireEntityProfile } from "@/lib/api/entity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/organizations/:id: organization profile (recipient and/or backer). */
export const GET = handle(async (_req: Request, ctx: Ctx<{ id: string }>) => {
  const id = idFrom((await ctx.params).id);
  const { dataset } = await load();
  return ok(dataset, requireEntityProfile(dataset, "organization", id));
});
