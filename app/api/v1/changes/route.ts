import { z } from "zod";
import { ChangeRecord } from "@/lib/domain/schemas";
import { changes, findInitiative } from "@/lib/intelligence/service";
import { handle, IdParam, load, notFound, ok, PAGE_NUMBERS, PageFields, pageOf, paginate, parseQuery } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Query = z
  .object({
    since: z.iso.datetime({ offset: true }).optional(),
    initiativeIds: z.array(IdParam).max(55).optional(),
    kinds: z.array(ChangeRecord.shape.kind).max(20).optional(),
    ...PageFields,
  })
  .strict();

/** GET /api/v1/changes: change log (official snapshot diffs, revisions and published corrections), newest first. */
export const GET = handle(async (req: Request) => {
  const q = parseQuery(req, Query, { arrays: ["initiativeIds", "kinds"], numbers: PAGE_NUMBERS });
  const page = pageOf(q);
  const { dataset } = await load();
  const ids = (q.initiativeIds ?? []).map((x) => {
    const ini = findInitiative(dataset, x);
    if (!ini) throw notFound(`No initiative with id or slug "${x}"`);
    return ini.id;
  });
  const since = q.since ? new Date(q.since).toISOString() : undefined;
  const items = changes(dataset, { since, initiativeIds: ids, kinds: q.kinds, limit: Number.POSITIVE_INFINITY });
  return ok(dataset, paginate(items, page));
});
