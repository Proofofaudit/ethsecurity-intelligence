import { z } from "zod";
import { searchClaims } from "@/lib/intelligence/service";
import { handle, load, ok, parseQuery } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Query = z.object({ q: z.string().trim().min(2).max(200), limit: z.number().int().min(1).max(25).optional() }).strict();

/** GET /api/v1/claims?q=: claim search (every query word must appear in the claim). Used by the command palette. */
export const GET = handle(async (req: Request) => {
  const q = parseQuery(req, Query, { numbers: ["limit"] });
  const { dataset } = await load();
  return ok(dataset, { query: q.q, items: searchClaims(dataset, q.q, q.limit ?? 8) });
});
