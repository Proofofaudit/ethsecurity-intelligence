import { metricsFor, orgName } from "@/lib/intelligence/service";
import { METRIC_BY_ID } from "@/lib/metrics/registry";
import { handle, idFrom, load, ok, type Ctx } from "@/lib/api/http";
import { initiativeSources, requireInitiative } from "@/lib/api/initiative";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/initiatives/:id/funding: official funding figures, pledge rows and donations. */
export const GET = handle(async (_req: Request, ctx: Ctx<{ id: string }>) => {
  const id = idFrom((await ctx.params).id);
  const { dataset } = await load();
  const ini = requireInitiative(dataset, id);
  const pledges = dataset.pledges.filter((p) => p.initiativeId === ini.id);
  const metrics = Object.fromEntries(
    Object.entries(metricsFor(dataset, ini.id) ?? {}).filter(([k]) => {
      const cat = METRIC_BY_ID.get(k)?.category;
      return cat === "financial" || cat === "concentration";
    }),
  );
  return ok(
    dataset,
    {
      initiativeId: ini.id,
      slug: ini.slug,
      funding: ini.funding,
      identity: "Official raised = outstanding pledges + confirmed donations. Received pledges arrive as donations and are already inside donated; they are never added twice.",
      pledges: pledges.map((p) => ({ ...p, backerName: orgName(dataset, p.backerId) ?? p.company })),
      donations: dataset.donations.filter((x) => x.initiativeId === ini.id),
      metrics,
    },
    { sources: initiativeSources(ini) },
  );
});
