import { CHANGELOG_STATES, CORRECTION_NOTICE, toChangelogEntry } from "@/lib/corrections";
import { traceClaim } from "@/lib/intelligence/service";
import { handle, idFrom, load, notFound, ok, type Ctx } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/claims/:id: one claim with its status, evidence, history and public corrections. */
export const GET = handle(async (_req: Request, ctx: Ctx<{ id: string }>) => {
  const id = idFrom((await ctx.params).id);
  const { dataset, store } = await load();
  const t = traceClaim(dataset, id);
  if (!t) throw notFound(`No claim with id "${id}"`);
  const corrections = (await store.listCorrections({ targetId: id, states: CHANGELOG_STATES })).map(toChangelogEntry).filter((x) => x !== null);
  return ok(
    dataset,
    { claim: t.claim, statusLabel: t.statusLabel, initiative: t.initiative, evidence: t.evidence, corrections, correctionNotice: CORRECTION_NOTICE },
    { sources: t.claim.sourceUrls.length ? t.claim.sourceUrls : undefined },
  );
});
