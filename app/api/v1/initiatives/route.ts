import { FilterSchema, filterInitiatives } from "@/lib/intelligence/service";
import { badRequest, decodeCursor, encodeCursor, handle, load, ok, queryObject } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHAPE = {
  arrays: ["categories", "stages"],
  numbers: ["goalMinUsd", "goalMaxUsd", "fundedMinPct", "fundedMaxPct", "limit", "offset"],
  booleans: ["existingWork", "hasSupportedEvidence", "hasCompletedMilestone", "hasPlannedIntegrations", "researchComplete"],
};

/** GET /api/v1/initiatives: filtered, alphabetical by default (no ranking). */
export const GET = handle(async (req: Request) => {
  const { cursor, ...rest } = queryObject(new URL(req.url).searchParams, SHAPE);
  if (cursor !== undefined && rest.offset !== undefined) throw badRequest("Use either cursor or offset, not both");
  if (cursor !== undefined) rest.offset = decodeCursor(String(cursor));
  const parsed = FilterSchema.safeParse(rest);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    throw badRequest(`${i?.path.join(".") || "query"}: ${i?.message ?? "invalid"}`);
  }
  const { dataset } = await load();
  const result = filterInitiatives(dataset, parsed.data);
  const next = result.offset + result.items.length;
  return ok(dataset, { ...result, nextCursor: next < result.total ? encodeCursor(next) : null });
});
