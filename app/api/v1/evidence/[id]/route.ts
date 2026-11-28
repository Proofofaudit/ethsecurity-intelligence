import { handle, idFrom, load, notFound, ok, type Ctx } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/evidence/:id: one evidence record and the claims that cite it. */
export const GET = handle(async (_req: Request, ctx: Ctx<{ id: string }>) => {
  const id = idFrom((await ctx.params).id);
  const { dataset } = await load();
  const evidence = dataset.evidence.find((e) => e.id === id);
  if (!evidence) throw notFound(`No evidence record with id "${id}"`);
  const citedBy = dataset.claims
    .filter((c) => c.evidenceIds.includes(id))
    .map((c) => ({ id: c.id, initiativeId: c.initiativeId, status: c.status, supports: c.supportingEvidenceIds.includes(id), contradicts: c.contradictingEvidenceIds.includes(id) }));
  return ok(dataset, { evidence, citedBy }, { sources: [evidence.url] });
});
