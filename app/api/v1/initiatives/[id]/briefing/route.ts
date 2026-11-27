import { briefingFor } from "@/lib/intelligence/service";
import { handle, idFrom, load, ok, type Ctx } from "@/lib/api/http";
import { requireInitiative } from "@/lib/api/initiative";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/initiatives/:id/briefing: the 10-minute briefing. Every item quotes official text, has a reading time and a source URL. */
export const GET = handle(async (_req: Request, ctx: Ctx<{ id: string }>) => {
  const id = idFrom((await ctx.params).id);
  const { dataset } = await load();
  const ini = requireInitiative(dataset, id);
  const briefing = briefingFor(dataset, ini.id);
  const sources = [...new Set((briefing?.items ?? []).flatMap((i) => i.sources.map((s) => s.url)))];
  return ok(dataset, briefing, { sources });
});
