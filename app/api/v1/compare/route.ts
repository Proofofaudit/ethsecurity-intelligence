import { z } from "zod";
import { compare, findInitiative } from "@/lib/intelligence/service";
import { handle, IdParam, load, notFound, ok, parseQuery } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Query = z.object({ ids: z.array(IdParam).min(2, "provide 2 to 5 initiative ids").max(5, "provide 2 to 5 initiative ids") }).strict();

/** GET /api/v1/compare?ids=a,b[,c,d,e]: side-by-side comparison of 2 to 5 initiatives. */
export const GET = handle(async (req: Request) => {
  const { ids } = parseQuery(req, Query, { arrays: ["ids"] });
  const { dataset } = await load();
  const unknown = ids.filter((id) => !findInitiative(dataset, id));
  if (unknown.length) throw notFound(`Unknown initiative ids: ${unknown.join(", ")}`);
  return ok(dataset, compare(dataset, ids));
});
