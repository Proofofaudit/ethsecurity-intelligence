import { z } from "zod";
import { dependencies, findInitiative } from "@/lib/intelligence/service";
import { handle, IdParam, load, notFound, ok, PAGE_NUMBERS, PageFields, pageOf, paginate, parseQuery } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Query = z.object({ initiative: IdParam.optional(), ...PageFields }).strict();

/** GET /api/v1/dependencies: standards, external repositories, adoption milestones and planned integrations. */
export const GET = handle(async (req: Request) => {
  const q = parseQuery(req, Query, { numbers: PAGE_NUMBERS });
  const page = pageOf(q, 55);
  const { dataset } = await load();
  if (q.initiative && !findInitiative(dataset, q.initiative)) throw notFound(`No initiative with id or slug "${q.initiative}"`);
  return ok(dataset, paginate(dependencies(dataset, q.initiative), page));
});
